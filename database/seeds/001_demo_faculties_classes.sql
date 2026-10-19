-- Du lieu thu: 3 khoa, moi khoa 5 lop. Khong tao/xoa tai khoan, khong doi Keycloak.
-- Chi cap nhat 27 ho so thu da duoc xac nhan, theo ca ID va ma sinh vien.
-- Can migration 009. Chay trong SQL Editor bang tai khoan quan tri database.
-- Neu ID/ma sinh vien khong con khop, toan bo giao dich se huy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

CREATE TEMP TABLE qut_demo_classes ON COMMIT DROP AS
SELECT prefix || lpad(n::text, 2, '0') AS code, department, faculty_order, n
FROM (VALUES
 ('DHTH', 'Công nghệ thông tin', 0),
 ('DHAT', 'An toàn & Mạng thông tin', 1),
 ('DHKT', 'Khoa học dữ liệu', 2)
) AS faculties(prefix, department, faculty_order)
CROSS JOIN generate_series(1, 5) AS n;

CREATE TEMP TABLE qut_demo_students ON COMMIT DROP AS
SELECT expected_id AS id, '90000000' || lpad(ordinal::text, 2, '0') AS username,
       (ordinal - 1) / 9 AS faculty_order, ((ordinal - 1) % 9) / 2 + 1 AS class_number
FROM (VALUES
 (4,1),(5,2),(6,3),(7,4),(8,5),(9,6),(10,7),(11,8),(12,9),
 (13,10),(14,11),(15,12),(16,13),(17,14),(18,15),(19,16),(20,17),(21,18),
 (22,19),(23,20),(25,21),(26,22),(27,23),(28,24),(29,25),(30,26),(36,27)
) AS students(expected_id, ordinal);

DO $$
BEGIN
 IF (SELECT count(*) FROM public.users u JOIN qut_demo_students d
     ON u.id=d.id AND u.username=d.username AND u.role='student') <> 27 THEN
   RAISE EXCEPTION 'Du lieu thu khong con khop 27 ID/ma sinh vien. Khong thay doi du lieu.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.student_classes c JOIN qut_demo_classes d
     ON lower(c.code)=lower(d.code) WHERE c.code<>d.code OR c.department IS DISTINCT FROM d.department) THEN
   RAISE EXCEPTION 'Ma lop da duoc su dung boi khoa khac. Can kiem tra truoc khi chay.';
 END IF;
END $$;

INSERT INTO public.student_classes(code,name,department,status)
SELECT code,code,department,'active' FROM qut_demo_classes ORDER BY faculty_order,n
ON CONFLICT(code) DO UPDATE SET status='active', updated_at=now()
WHERE student_classes.status IS DISTINCT FROM 'active';

UPDATE public.users u SET department=c.department,student_class_id=c.id
FROM qut_demo_students d
JOIN qut_demo_classes spec ON spec.faculty_order=d.faculty_order AND spec.n=d.class_number
JOIN public.student_classes c ON c.code=spec.code
WHERE u.id=d.id AND u.username=d.username AND u.role='student'
AND (u.department IS DISTINCT FROM c.department OR u.student_class_id IS DISTINCT FROM c.id);

-- Chi thong ke 15 lop mau. Khong xoa lop hoac khoa khac neu du lieu that da duoc them.
SELECT c.department AS khoa,c.code AS lop,count(u.id) AS so_sinh_vien
FROM public.student_classes c JOIN qut_demo_classes d ON d.code=c.code
LEFT JOIN public.users u ON u.student_class_id=c.id AND u.role='student'
GROUP BY c.id,c.department,c.code ORDER BY c.department,c.code;
COMMIT;
