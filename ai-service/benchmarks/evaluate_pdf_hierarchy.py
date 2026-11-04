"""Offline six-PDF benchmark; no API, model, registry or database imports."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pdf_hierarchy import chunk_pdf
from test_pdf_hierarchy import GOLD


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--pdf-dir',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--outline',type=Path,help='Optional reviewed structure snapshot, IDs preserved when present')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    outline=json.loads(args.outline.read_text(encoding='utf-8')) if args.outline else None
    reports=[]
    for number,(expected,_) in GOLD.items():
        files=list(args.pdf_dir.glob(f'Chuong{number}_*.pdf'))
        if len(files)!=1:parser.error(f'Expected exactly one chapter {number} PDF')
        path=files[0];documents,report=chunk_pdf(path,outline)
        actual=[b['page'] for b in report['boundaries']]
        report.update(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            confirmed_boundary_misses=len(set(expected)-set(actual)),
            unexpected_boundaries=len(set(actual)-set(expected)),
            unlocated_toc_sections=len(report['missing']),
            cross_confirmed_boundary_chunks=sum(any(d.metadata['region_start_page']<p<=d.metadata['region_end_page'] for p in expected) for d in documents),
            oversized_chunks=sum(len(d.page_content)>800 for d in documents))
        reports.append(report)
    result={'method':'Reviewed page anchors; five TOC section starts remain unknown, not negative ground truth.',
            'runtime_integration':False,'chunk_size':800,'overlap':150,'documents':reports}
    rendered=json.dumps(result,ensure_ascii=False,indent=2)
    if args.output:args.output.write_text(rendered+'\n',encoding='utf-8')
    print(rendered)


if __name__=='__main__':main()
