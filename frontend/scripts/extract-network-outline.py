"""Extract this specific outline; fail rather than guess a changed document."""
import json
import pathlib
import re
import pdfplumber

repo = pathlib.Path(__file__).resolve().parents[2]
pdf = repo / 'ĐỀ CƯƠNG HỌC PHẦN THỨ 52(ATTT).pdf'
with pdfplumber.open(pdf) as document:
    pages = [page.extract_text() or '' for page in document.pages]
    section = '\n'.join(pages).split('6.2. Nội dung chi tiết\n', 1)[1].split('7. PHƯƠNG PHÁP DẠY VÀ HỌC', 1)[0]
    chapters = []
    for line in section.splitlines():
        chapter = re.fullmatch(r'Chương (\d+)\. (.+)', line)
        topic = re.fullmatch(r'(\d+\.\s*\d+)\. (.+)', line)
        if chapter:
            chapters.append(dict(code='Chương '+chapter[1], name=chapter[2], topics=[]))
        elif topic:
            assert int(topic[1].split('.')[0]) == len(chapters)
            chapters[-1]['topics'].append(dict(code=topic[1], name=topic[2]))
        elif line.strip():
            raise ValueError('Unrecognized detail line: '+line)
    descriptions = [
        ('CLO1.1*', 'Trình bày và giải thích được các khái niệm cơ bản về hệ điều hành.'),
        ('CLO1.2*', 'Phân tích được cấu trúc, nguyên lý hoạt động của một số thành phần cơ bản của hệ thống.'),
        ('CLO2.1*', 'Làm chủ các hệ thống mạng máy tính cục bộ ở các trường học, các công ty, xí nghiêp vừa và nhỏ'),
        ('CLO2.2*', 'Vận dụng kiến thức có được để sử dụng, khai thác và bảo trì hệ thống mạng máy tính trên hai mô hình workgroup và domain một cách hiệu quả'),
        ('CLO3.1*', 'Có hứng thú học công nghệ thông tin, yêu thích và tìm tòi khoa học; trân trọng với những đóng góp của công nghệ thông tin cho sự tiến bộ của xã hội và đối với công lao của các nhà khoa học.'),
        ('CLO3.2*', 'Có thái độ khách quan, trung thực; có tác phong tỉ mỉ, cẩn thận, chính xác và có tinh thần hợp tác trong việc học tập môn công nghệ thông tin, cũng như trong việc áp dụng các hiểu biết đã đạt được.'),
        ('CLO3.3*', 'Có ý thức vận dụng những hiểu biết công nghệ thông tin vào trong các khoa học khác, vào đời sống nhằm cải thiện điều kiện sống, học tập, cũng như giữ gìn bảo quản thiết bị, ý thức tiết kiệm'),
    ]
    assert [len(c['topics']) for c in chapters] == [6,8,8,6,6,9,9,7]
    data = dict(source=pdf.name+'; trang 1: thông tin; trang 2–3: CLO; trang 4–6: nội dung chi tiết', course=dict(code='0101101973',name='Quản trị hệ thống mạng',credits=3), chapters=chapters, clos=[dict(code=c, description=d) for c,d in descriptions])
    target = pathlib.Path(__file__).with_name('network-administration-outline.json')
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    # Render the relevant original pages for visual review.
    out = repo/'tmp'/'pdfs'
    out.mkdir(parents=True, exist_ok=True)
    for i in range(6):
        document.pages[i].to_image(resolution=85).save(out/f'outline-page-{i+1}.png')
    print('8 chapters, 59 topics, 7 CLO; JSON prepared. No API writes.')
