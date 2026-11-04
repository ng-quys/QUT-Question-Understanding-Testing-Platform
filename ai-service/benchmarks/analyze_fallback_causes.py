"""Report-only review of section-to-fallback transitions on the six local PDFs."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pdf_hierarchy import chunk_pdf, read_slides, is_toc

# Manual review conclusions, independently based on source text and rendered
# pages. They are report annotations, not rules or overrides used by the parser.
REVIEWS = {
 (1,11):('premature','Cơ sở hạ tầng mạng','p10 defines human/computer systems; p12 continues humans, host computers and network hardware; p13-14 computer components.'),
 (1,27):('premature','Hệ thống file trên UNIX','p24-26 have the same title; p27 is a filesystem-listing image; p28 explains its columns; p30-42 remain filesystem/permissions/sharing.'),
 (1,48):('premature','The OSI Model','p47 introduces OSI; p48 is its diagram; p49-51 explain OSI layers; p52-56 continue network media/connectivity under the same TOC item.'),
 (1,68):('reasonable','Ending illustration','Last page has no extracted text; visual review shows an ending/question illustration, not an IPv6 section.'),
 (2,12):('premature','multi-boot','p10-11 Boot Loader; p12 multi-boot; p13-17 startup scripts/shutdown; p18-22 Windows startup/shutdown; next TOC section starts p23.'),
 (2,58):('reasonable','Demo','Mixed installation demo: VMware, operating system and software; not specifically Kernel customization. p59 has no extracted text.'),
 (4,4):('premature','Mô hình quản trị','p3 begins MÔI TRƯỜNG QUẢN TRỊ; p4-15 explain Windows Server roles, infrastructure, AD and domains. Next section starts p17; p16 is repeated TOC.'),
 (4,58):('premature','Các thành phần FSRM','p55-57 introduce FSRM and its components; rendered p58 shows FSRM tree; p59-70 continue configuration, quotas and screening under storage management.'),
 (5,14):('unresolved','Internet Protocol Version 4','Rendered page is IP properties/network connection configuration. It may be an administration-tool example or transition/setup; no explicit TOC/parent relation proves ownership.'),
 (5,29):('premature','Hoàn thành','p25-28 Domain Controller configuration; p29 domain Administrator login; p30-33 join/authenticate workstation and welcome to domain. Same AD workflow; DHCP starts p34.'),
 (5,43):('premature','Add Roles and Features','p42 introduces DHCP installation; rendered p43 selects DHCP Server, p44-48 configure scope/lease/client, p49 DHCP-enabled connection result; DNS starts p50.'),
 (5,74):('reasonable','MỘT SỐ DỊCH VỤ KHÁC','Additional-service assignment is not established DNS material; retain null label, including ending p75.'),
 (6,72):('reasonable','DEMO MỘT SỐ DỊCH VỤ','p72-73 announce a mixed demo, p74 DHCP is INTRANET while p75 DNS/p76 WEB are INTERNET; p77 additional-service assignment. Keep all as fallback.'),
}


def main():
    root=Path(__file__).resolve().parents[2]
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    parser_path=root/'ai-service/pdf_hierarchy.py'
    before_hash=hashlib.sha256(parser_path.read_bytes()).hexdigest()
    baseline=json.loads((root/'ai-service/benchmarks/pdf_hierarchy_scope_after.json').read_text(encoding='utf-8'))
    old={d['file']:d for d in baseline['documents']}
    reports=[]
    for number in range(1,7):
        files=list(root.glob(f'Chuong{number}_*.pdf'))
        if len(files)!=1:raise ValueError('Exactly six known lecture PDFs are required')
        path=files[0];slides=read_slides(path);docs,report=chunk_pdf(path)
        if hashlib.sha256(path.read_bytes()).hexdigest()!=old[path.name]['pdf_sha256']:
            raise ValueError('PDF differs from reviewed baseline')
        starts=[b['page'] for b in report['boundaries']]
        cases=[]
        for scope_end in report['scope_ends']:
            page=scope_end['page'];end=min([p for p in starts if p>page]+[len(slides)+1])-1
            status,title,evidence=REVIEWS[(number,page)]
            affected=[s for s in slides if page<=s.page<=end and not is_toc(s)]
            cases.append({**scope_end,'heading':title,'fallback_through_page':end,
                'classification':status,'evidence':evidence,
                'affected_extracted_characters':sum(len(s.text) for s in affected),
                'excluded_repeated_toc_pages':[s.page for s in slides if page<=s.page<=end and is_toc(s)],
                'page_evidence':[{'page':s.page,'characters':len(s.text),
                    'heading_text':s.text.splitlines()[0] if s.text else '',
                    'text_sha256':hashlib.sha256(s.text.encode()).hexdigest()} for s in affected]})
        regression_pages={5:[74],6:[72,73,74]}.get(number,[])
        regressions=[]
        for page in regression_pages:
            hits=[d for d in docs if any(span['page']==page for span in d.metadata['page_spans'])]
            regressions.append({'page':page,'chunks':len(hits),
                'passed':bool(hits) and all(d.metadata['section'] is None and d.metadata['subsection'] is None and d.metadata['fallback'] for d in hits)})
        reports.append({'file':path.name,'pdf_chapter':number,'pdf_sha256':old[path.name]['pdf_sha256'],
            'confirmed_sections':len(report['boundaries']),'unlocated_toc_sections':len(report['missing']),
            'unexpected_reviewed_start_boundaries':len({b['page'] for b in report['boundaries']}-set(old[path.name]['confirmed_start_pages'])),
            'missed_reviewed_start_boundaries':len(set(old[path.name]['confirmed_start_pages'])-{b['page'] for b in report['boundaries']}),
            'chunks':len(docs),'fallback_character_ratio':report['fallback_character_ratio'],
            'scope_end_classifications':{status:sum(c['classification']==status for c in cases) for status in ('premature','reasonable','unresolved')},
            'scope_ends':cases,'prior_bug_regressions':regressions})
    after_hash=hashlib.sha256(parser_path.read_bytes()).hexdigest()
    if before_hash!=after_hash:raise ValueError('Parser changed during report-only audit')
    result={'parser_sha256_before':before_hash,'parser_sha256_after':after_hash,'parser_changed':False,
        'method':'Manual semantic/layout review; no automatic label expansion. Affected characters count original page text (including whitespace), excluding repeated TOC pages and inserted region separators.',
        'documents':reports}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for r in reports:
        print(r['pdf_chapter'],r['chunks'],r['fallback_character_ratio'],[(c['page'],c['classification'],c['affected_extracted_characters']) for c in r['scope_ends']],flush=True)


if __name__=='__main__':main()
