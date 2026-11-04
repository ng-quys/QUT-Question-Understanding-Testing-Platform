import unittest
import hashlib
import tempfile
from pathlib import Path
from pdf_hierarchy import Slide, analyze_slides, chunk_pdf, chunk_slides, outline_links, read_slides, reviewed_span


class PdfHierarchyTests(unittest.TestCase):
    def test_image_page_without_text_is_not_by_itself_a_section_end(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. DNS'),
                Slide(3,'DNS\nSource',['DNS']),Slide(4,'',[],False,1),
                Slide(5,'DNS details\nRelated content',['DNS details'])]
        docs,result=chunk_slides(slides)
        self.assertFalse(result['scope_ends'])
        self.assertEqual('no_text_layer_pending_review',result['scope_reviews'][0]['reason'])
        self.assertEqual('DNS',docs[-1].metadata['section'])
        self.assertEqual('no_text_layer',result['page_inventory'][3]['status'])

    def test_independent_transition_clears_label_until_confirmed_start(self):
        slides=[Slide(1,'Chương 5'),Slide(2,'NỘI DUNG\n1. DNS\n2. DHCP'),
                Slide(3,'DNS\nDNS source body',['DNS']),
                Slide(4,'Demo dịch vụ DHCP\nPreserved demo text',['Demo dịch vụ DHCP']),
                Slide(5,'DNS in body must not reactivate the old section'),
                Slide(6,'DHCP\nNew confirmed body',['DHCP'])]
        docs,result=chunk_slides(slides,'fixture.pdf')
        fallback=[d for d in docs if d.metadata['region_start_page']==4]
        self.assertTrue(fallback)
        self.assertTrue(all(d.metadata['section'] is None and d.metadata['subsection'] is None
                            and d.metadata['chapter']=='5' and d.metadata['fallback'] for d in fallback))
        self.assertIn('Preserved demo text',' '.join(d.page_content for d in fallback))
        self.assertEqual('DHCP',next(d for d in docs if d.metadata['region_start_page']==6).metadata['section'])
        self.assertEqual(4,result['scope_ends'][0]['page'])

    def test_unknown_title_only_page_is_isolated_without_closing_section(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. Dịch vụ DNS'),
                Slide(3,'Dịch vụ DNS\nDNS body',['Dịch vụ DNS']),
                Slide(4,'Cài đặt DNS',['Cài đặt DNS']),
                Slide(5,'Standalone unrelated subject',['Standalone unrelated subject'],True,1),
                Slide(6,'Other subject\nUnrelated body text',['Other subject']),
                Slide(7,'DNS details\nRelated continuation',['DNS details'])]
        docs,result=chunk_slides(slides)
        self.assertFalse(result['scope_ends'])
        self.assertEqual(5,result['scope_reviews'][0]['page'])
        self.assertEqual('Dịch vụ DNS',next(d for d in docs if d.metadata['region_start_page']==3).metadata['section'])
        self.assertIsNone(next(d for d in docs if d.metadata['region_start_page']==5).metadata['section'])
        self.assertIsNone(next(d for d in docs if d.metadata['region_start_page']==6).metadata['section'])
        self.assertEqual('Dịch vụ DNS',docs[-1].metadata['section'])

    def test_reviewed_mapping_requires_hash_parent_and_bounded_page(self):
        sha='76c164860916483f501397d0fca5a30090647c083e755224ee5374a2d1d17add'
        parent={'page':10,'title':'Hệ thống là gì?'}
        self.assertIsNotNone(reviewed_span(sha,parent,11))
        for digest,active,page in [(None,parent,11),('0'*64,parent,11),
                (sha,{'page':9,'title':parent['title']},11),
                (sha,{'page':10,'title':'Different section'},11),(sha,parent,10),(sha,parent,15)]:
            self.assertIsNone(reviewed_span(digest,active,page))

    def test_reviewed_span_cannot_override_hard_stop_or_extend_past_limit(self):
        sha='76c164860916483f501397d0fca5a30090647c083e755224ee5374a2d1d17add'
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. Hệ thống là gì?'),
                Slide(10,'Hệ thống là gì?\nParent',['Hệ thống là gì?']),
                Slide(11,'Reviewed image',['Reviewed image'],True,1),
                Slide(14,'Reviewed body'),Slide(15,'Must not inherit label')]
        docs,result=chunk_slides(slides,pdf_sha256=sha)
        self.assertEqual('reviewed_span_limit',result['scope_ends'][0]['reason'])
        self.assertIsNone(docs[-1].metadata['section'])
        slides.insert(-1,Slide(12,'Demo ngoài mục\nKeep text',['Demo ngoài mục']))
        slides.sort(key=lambda s:s.page)
        docs,result=chunk_slides(slides,pdf_sha256=sha)
        self.assertEqual(12,result['scope_ends'][0]['page'])
        self.assertTrue(all(d.metadata['section'] is None for d in docs
                            if d.metadata['region_start_page']>=12))

    def test_verified_child_and_adjacent_image_title_continue_scope(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. Storage'),
                Slide(3,'Storage\n• File Server Resource Manager',['Storage']),
                Slide(4,'File Server Resource Manager\nExplained content',['File Server Resource Manager']),
                Slide(5,'File Server Resource Manager',['File Server Resource Manager'],True,1),
                Slide(6,'File Server Resource Manager\nMore source content',['File Server Resource Manager'])]
        docs,result=chunk_slides(slides)
        self.assertFalse(result['scope_ends'])
        self.assertFalse(result['scope_reviews'])
        self.assertTrue(all(d.metadata['section']=='Storage' for d in docs if d.metadata['region_start_page']>=3))

    def test_body_transition_words_do_not_end_scope(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. DNS'),
                Slide(3,'DNS\nSource',['DNS']),Slide(4,'DNS details\nDemo appears in body',['DNS details'])]
        docs,result=chunk_slides(slides)
        self.assertFalse(result['scope_ends'])
        self.assertEqual('DNS',docs[-1].metadata['section'])

    def test_provenance_and_overlap_for_confirmed_and_fallback_regions(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. DNS'),
                Slide(3,'DNS\n'+''.join(f'dns-token-{i:04d} ' for i in range(150)),['DNS']),
                Slide(4,'Một số dịch vụ khác\n'+''.join(f'other-token-{i:04d} ' for i in range(150)),['Một số dịch vụ khác']),
                Slide(5,'')]
        docs,result=chunk_slides(slides)
        prior={};covered={p.page:bytearray(len(p.text)) for p in slides}
        for d in docs:
            m=d.metadata;region=(m['region_start_page'],m['region_end_page'])
            if region in prior:
                self.assertLessEqual(prior[region]-m['start_index'],150)
            prior[region]=m['start_index']+len(d.page_content)
            self.assertLessEqual(len(d.page_content),800)
            text='\n'.join(p.text for p in slides if region[0]<=p.page<=region[1])
            self.assertEqual(d.page_content,text[m['start_index']:m['start_index']+len(d.page_content)])
            for span in m['page_spans']:
                covered[span['page']][span['start']:span['end']]=b'\1'*(span['end']-span['start'])
        for page in slides:
            self.assertTrue(all(covered[page.page][i] or c.isspace() for i,c in enumerate(page.text)))
        self.assertEqual('no_text_layer',result['page_inventory'][-1]['status'])

    def test_toc_layout_and_split_heading_required(self):
        slides = [Slide(1, 'Chương 5'), Slide(2, 'NỘI DUNG\n1. Công cụ quản trị'),
                  Slide(3, '1.\nCông cụ quản trị\nNội dung', ['1. Công cụ quản trị'])]
        self.assertEqual([3], [b['page'] for b in analyze_slides(slides)['boundaries']])
        slides[2].titles = []
        self.assertEqual([], analyze_slides(slides)['boundaries'])

    def test_body_bullets_and_outline_do_not_create_boundaries(self):
        slides = [Slide(1, 'Chương 1'), Slide(2, 'NỘI DUNG\n1. DNS'),
                  Slide(3, 'Khác\n1. DNS\nCLO1.2', ['Khác'])]
        result = analyze_slides(slides, {'chapters': [{'code': 'Chương 9', 'topics': [{'name':'DNS'}]}]})
        self.assertEqual([], result['boundaries'])
        self.assertEqual(1,len(result['missing']))

    def test_repeated_agenda_never_creates_new_section(self):
        slides = [Slide(1,'Chương 6'),Slide(2,'NỘI DUNG\n1. DNS'),
                  Slide(3,'1. DNS',['1. DNS']),Slide(4,'NỘI DUNG\n1. DNS'),
                  Slide(5,'1. DNS',['1. DNS'])]
        self.assertEqual(1,len(analyze_slides(slides)['boundaries']))

    def test_course_identity_is_separate_and_ambiguous_matches_stay_unassigned(self):
        outline={'chapters':[{'id':20,'code':'Chương 2','topics':[{'id':37,'code':'2.3','name':'Hệ điều hành'}]}]}
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. Hệ điều hành'),
                Slide(3,'1. Hệ điều hành',['1. Hệ điều hành'])]
        result=analyze_slides(slides,outline)
        self.assertEqual('1',result['pdf_chapter_number'])
        self.assertIsNone(result['boundaries'][0]['course_chapter_id'])
        self.assertEqual(20,result['boundaries'][0]['outline_candidates'][0]['course_chapter_id'])
        outline['chapters'].append({'id':99,'topics':[{'name':'Hệ điều hành'}]})
        self.assertIsNone(analyze_slides(slides,outline)['boundaries'][0]['course_chapter_id'])
        self.assertEqual([],outline_links('unrelated',outline))

    def test_out_of_order_and_multiple_titles_fail_closed(self):
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. DNS\n2. DHCP'),
                Slide(3,'2. DHCP',['2. DHCP']),Slide(4,'1. DNS',['1. DNS'])]
        result=analyze_slides(slides)
        self.assertEqual([3],[b['page'] for b in result['boundaries']])
        self.assertTrue(any(w['reason']=='non_monotonic_section' for w in result['warnings']))

    def test_missing_toc_and_ambiguous_titles_are_logged_for_review(self):
        self.assertIn('no_numbered_toc',[w['reason'] for w in analyze_slides([Slide(1,'Chương 1')])['warnings']])
        slides=[Slide(1,'Chương 1'),Slide(2,'NỘI DUNG\n1. DNS\n2. DHCP'),
                Slide(3,'DNS DHCP',['DNS','DHCP'])]
        result=analyze_slides(slides)
        self.assertFalse(result['boundaries'])
        self.assertIn('ambiguous_title',[w['reason'] for w in result['warnings']])


# Reviewed start-page annotations from the six supplied PDFs, not computed by
# the parser. Empty chapter 3 does NOT assert there are no real sections.
GOLD = {
    1: ([10,15,23,43,46,57],1), 2: ([3,23,49,57],0), 3: ([],4),
    4: ([3,17,40,49],0), 5: ([3,8,15,34,50],0), 6: ([3,12,20,54],0),
}

# Page-range annotations independently reviewed in the fallback-causes report.
CONTINUITY_GOLD = {
    1:[(11,14,'Hệ thống là gì?'),(27,42,'Hệ thống tập tin'),(48,56,'Mạng')],
    2:[(12,22,'System startup and shutdown')],
    4:[(4,15,'MÔI TRƯỜNG QUẢN TRỊ'),(58,70,'QUẢN LÝ LƯU TRỮ')],
    5:[(29,33,'Dịch vụ Active Directory'),(43,49,'Dịch vụ DHCP')],
}


class SuppliedPdfRegressionTests(unittest.TestCase):
    def test_actual_pdf_hash_guards_mapping_independent_of_filename(self):
        root=Path(__file__).resolve().parents[1]
        files=list(root.glob('Chuong1_*.pdf'))
        if len(files)!=1:self.skipTest('Local chapter 1 PDF required')
        original=files[0].read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            renamed=Path(tmp)/'unrelated-name.pdf'
            renamed.write_bytes(original)
            _,same=chunk_pdf(renamed)
            self.assertEqual(3,len(same['reviewed_continuations']))
            # A harmless PDF comment changes the bytes/hash, not its lecture text.
            renamed.write_bytes(original+b'\n% changed version for isolated test\n')
            docs,changed=chunk_pdf(renamed)
            self.assertNotEqual(same['pdf_sha256'],changed['pdf_sha256'])
            self.assertFalse(changed['reviewed_continuations'])
            self.assertTrue(all(not d.metadata['reviewed_continuations'] for d in docs))

    def test_six_pdfs_against_reviewed_start_pages(self):
        root=Path(__file__).resolve().parents[1]
        for number,(expected,unlocated) in GOLD.items():
            files=list(root.glob(f'Chuong{number}_*.pdf'))
            if len(files)!=1:
                self.skipTest('Six local lecture PDFs are required; fixtures are not bundled')
            with self.subTest(chapter=number):
                documents,result=chunk_pdf(files[0])
                self.assertEqual(expected,[b['page'] for b in result['boundaries']])
                self.assertEqual(unlocated,len(result['missing']))
                self.assertEqual(str(number),result['pdf_chapter_number'])
                self.assertTrue(all(len(d.page_content)<=800 for d in documents))
                slides=read_slides(files[0])
                tails={1:{67:'Mạng IPv4'},2:{58:None},3:{29:None},4:{70:'QUẢN LÝ LƯU TRỮ'},
                       5:{14:None,74:None},6:{72:None,73:None,74:None,75:None,76:None,77:None}}
                for first,last,section in CONTINUITY_GOLD.get(number,[]):
                    for page in range(first,last+1):
                        hits=[d for d in documents if any(s['page']==page for s in d.metadata['page_spans'])]
                        self.assertTrue(hits,(number,page))
                        self.assertTrue(all(d.metadata['section']==section and not d.metadata['fallback'] for d in hits),(number,page))
                    self.assertTrue(any(c['start_page']==first and c['end_page']==last for c in result['reviewed_continuations']))
                if number==1:self.assertIn(68,[s['page'] for s in result['scope_ends']])
                if number==2:self.assertIn(58,[s['page'] for s in result['scope_ends']])
                if number==5:self.assertIn(74,[s['page'] for s in result['scope_ends']])
                if number==6:self.assertIn(72,[s['page'] for s in result['scope_ends']])
                covered={s.page:bytearray(len(s.text)) for s in slides};last_ends={}
                for page,section in tails[number].items():
                    hits=[d for d in documents if any(s['page']==page for s in d.metadata['page_spans'])]
                    self.assertTrue(hits,f'page {page} must be retained')
                    self.assertTrue(all(d.metadata['section']==section for d in hits),(page,section))
                for d in documents:
                    self.assertFalse(any(d.metadata['region_start_page']<p<=d.metadata['region_end_page'] for p in expected))
                    region='\n'.join(s.text for s in slides if d.metadata['region_start_page']<=s.page<=d.metadata['region_end_page'])
                    start=d.metadata['start_index']
                    self.assertGreaterEqual(start,0)
                    self.assertEqual(d.page_content,region[start:start+len(d.page_content)])
                    rid=(d.metadata['region_start_page'],d.metadata['region_end_page'])
                    if rid in last_ends:self.assertLessEqual(last_ends[rid]-start,150)
                    last_ends[rid]=start+len(d.page_content)
                    for span in d.metadata['page_spans']:
                        page=slides[span['page']-1]
                        self.assertEqual(span['page_text_sha256'],hashlib.sha256(page.text.encode()).hexdigest())
                        covered[span['page']][span['start']:span['end']]=b'\1'*(span['end']-span['start'])
                for page in slides:self.assertTrue(all(covered[page.page][i] or c.isspace() for i,c in enumerate(page.text)))


if __name__=='__main__':unittest.main()
