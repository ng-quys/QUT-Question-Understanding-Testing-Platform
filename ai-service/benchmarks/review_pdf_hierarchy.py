"""Read-only PDF audit. Writes a local report, never changes parser or data.

Page provenance is calculated independently from returned chunk offsets. Full
PDF text stays in memory; report stores hashes, titles and page ranges only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdf_hierarchy import chunk_pdf, read_slides
from test_pdf_hierarchy import GOLD, CONTINUITY_GOLD


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def audit(path, outline):
    slides = read_slides(path)
    chunks, report = chunk_pdf(path, outline)
    expected, _ = GOLD[int(report['pdf_chapter_number'])]
    provenance, coverage, sources = [], {}, {}
    violations = 0
    page_coverage={p.page:bytearray(len(p.text)) for p in slides}
    overlaps, previous_ends, provenance_mismatches = [], {}, 0
    for chunk in chunks:
        m = chunk.metadata
        region = (m['region_start_page'], m['region_end_page'])
        pages = [p for p in slides if region[0] <= p.page <= region[1]]
        text = '\n'.join(p.text for p in pages)
        sources[region] = text
        mask = coverage.setdefault(region, bytearray(len(text)))
        start = m['start_index']
        end = start + len(chunk.page_content)
        exact = start >= 0 and text[start:end] == chunk.page_content
        violations += not exact
        spans, offset = [], 0
        for page in pages:
            stop = offset + len(page.text)
            lo, hi = max(offset, start), min(stop, end)
            if hi > lo:
                spans.append({'page': page.page, 'start': lo-offset, 'end': hi-offset,
                              'page_text_sha256': digest(page.text)})
                page_coverage[page.page][lo-offset:hi-offset]=b'\x01'*(hi-lo)
            offset = stop + 1
        if exact:
            mask[start:end] = b'\x01' * (end-start)
        if region in previous_ends:
            overlaps.append(max(0,previous_ends[region]-start))
        previous_ends[region]=end
        if 'page_spans' in m:
            provenance_mismatches+=m['page_spans']!=spans
        provenance.append({'chunk_id': m['chunk_id'], 'section': m['section'],
                           'pdf_sha256':m.get('pdf_sha256'),
                           'reviewed_continuations':m.get('reviewed_continuations',[]),
                           'fallback': m['fallback'], 'region_pages': list(region),
                           'region_offset': start, 'characters': len(chunk.page_content),
                           'text_sha256': digest(chunk.page_content), 'exact_source_match': exact,
                           'page_spans': spans})
    report.update(file=path.name, pdf_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        confirmed_start_pages=expected,
        missed_reviewed_boundaries=sorted(set(expected)-{b['page'] for b in report['boundaries']}),
        unexpected_boundaries=sorted({b['page'] for b in report['boundaries']}-set(expected)),
        crossing_confirmed_boundary_chunks=sum(any(c['region_pages'][0]<p<=c['region_pages'][1] for p in expected) for c in provenance),
        source_match_failures=violations,
        uncovered_nonwhitespace_characters=sum(not page_coverage[p.page][i] and not char.isspace() for p in slides for i,char in enumerate(p.text)),
        overlap_limit=150, maximum_observed_overlap=max(overlaps,default=0),
        excessive_overlap_pairs=sum(x>150 for x in overlaps),
        metadata_page_provenance_mismatches=provenance_mismatches,
        crossing_scope_end_chunks=sum(any(c['region_pages'][0]<s['page']<=c['region_pages'][1] for s in report.get('scope_ends',[])) for c in provenance),
        oversized_chunks=sum(c['characters']>800 for c in provenance),
        fallback_chunks=sum(c['fallback'] for c in provenance),
        fallback_chunks_with_section=sum(c['fallback'] and c['section'] is not None for c in provenance),
        transitions=[{'page':b['page'],'section':b['title'],
                      'preceding_page':b['page']-1,
                      'preceding_title':slides[b['page']-2].text.splitlines()[0] if slides[b['page']-2].text else '',
                      'source_page_text_sha256':digest(slides[b['page']-1].text)} for b in report['boundaries']],
        provenance=provenance)
    # Independently reviewed scope counterexamples, not parser-derived gold.
    scope_reviews = {
        '5': (74, 'Additional-services assignment is not established DNS content'),
        '6': (74, 'DHCP demo belongs to INTRANET coverage, not inherited INTERNET'),
    }
    finding = scope_reviews.get(report['pdf_chapter_number'])
    report['scope_counterexamples'] = []
    if finding:
        page, reason = finding
        affected = [c for c in provenance if any(s['page']==page for s in c['page_spans'])
                    and not c['fallback'] and c['section'] is not None]
        report['scope_counterexamples'] = [{'page':page, 'reason':reason,
            'affected_chunks':[{'chunk_id':c['chunk_id'],'inherited_section':c['section']} for c in affected]}]
    report['reviewed_scope_error_chunks']=sum(len(s['affected_chunks']) for s in report['scope_counterexamples'])
    reviewed = CONTINUITY_GOLD.get(int(report['pdf_chapter_number']),[])
    report['reviewed_premature_scope_ends']=sum(any(first<=s['page']<=last for first,last,_ in reviewed)
                                              for s in report['scope_ends'])
    report['continuity_checks']=[{'start_page':first,'end_page':last,'expected_section':section,
        'passed':all(bool(hits) and all(c['section']==section and not c['fallback'] for c in hits)
                     for page in range(first,last+1)
                     for hits in [[c for c in provenance if any(s['page']==page for s in c['page_spans'])]])}
        for first,last,section in reviewed]
    return report


def main():
    parser=argparse.ArgumentParser()
    root=Path(__file__).resolve().parents[2]
    parser.add_argument('--pdf-dir',type=Path,default=root)
    parser.add_argument('--outline',type=Path,default=root/'frontend/scripts/network-administration-outline.json')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--before',type=Path,help='Previous audit JSON; matching PDF hashes required')
    args=parser.parse_args()
    outline=json.loads(args.outline.read_text(encoding='utf-8'))
    reports=[]
    for number in GOLD:
        files=list(args.pdf_dir.glob(f'Chuong{number}_*.pdf'))
        if len(files)!=1:parser.error(f'Expected exactly one chapter {number} PDF')
        reports.append(audit(files[0],outline))
    payload={'runtime_changed':False,'outline_provenance':'Local outline snapshot; names verified against course 11 in earlier read-only DB audit. No IDs invented.',
             'scope':'23 reviewed boundaries; five TOC entries have no independently confirmed starts. Not a universal precision estimate.',
             'page_numbering':'1-based physical PDF page',
             'readiness':'Offline experiment only. Five TOC entries remain unlocated. Reviewed continuations are scoped to exact PDF hashes and page ranges; no runtime integration.',
             'provenance_note':'page_spans independently recomputed by audit and compared with parser metadata when available.',
             'documents':reports}
    if args.before:
        before=json.loads(args.before.read_text(encoding='utf-8'))
        old={d['file']:d for d in before['documents']}
        fields=('chunk_count','fallback_character_ratio','fallback_regions')
        comparisons=[]
        for r in reports:
            b=old[r['file']]
            if b['pdf_sha256']!=r['pdf_sha256']:raise ValueError('Before/after PDF hashes differ')
            comparisons.append({'file':r['file'],
                'before':{**{f:b[f] for f in fields},'confirmed_sections':len(b['boundaries']),
                          'unresolved_sections':len(b['missing']),
                          'reviewed_premature_scope_ends':sum(any(first<=s['page']<=last for first,last,_ in CONTINUITY_GOLD.get(int(b['pdf_chapter_number']),[])) for s in b.get('scope_ends',[])),
                          'reviewed_scope_error_chunks':sum(len(s['affected_chunks']) for s in b['scope_counterexamples'])},
                'after':{**{f:r[f] for f in fields},'confirmed_sections':len(r['boundaries']),
                         'unresolved_sections':len(r['missing']),
                         'reviewed_premature_scope_ends':r['reviewed_premature_scope_ends'],
                         'reviewed_scope_error_chunks':r['reviewed_scope_error_chunks']}})
        payload['before_after']=comparisons
    args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for r in reports:
        print(r['file'],len(r['boundaries']),len(r['missing']),r['chunk_count'],r['fallback_character_ratio'],r['source_match_failures'],r['uncovered_nonwhitespace_characters'],flush=True)


if __name__=='__main__':main()
