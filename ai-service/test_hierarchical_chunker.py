import unittest

from hierarchical_chunker import (
    FIXED_CHUNK_OVERLAP,
    FIXED_CHUNK_SIZE,
    HierarchyAwareStore,
    chunk_text,
    detect_heading,
    validate_strategy,
)
from langchain_core.documents import Document


class HierarchicalChunkerTest(unittest.TestCase):
    def test_recognizes_arabic_and_roman_chapters(self):
        self.assertEqual(1, detect_heading("CHƯƠNG 1: QUẢN TRỊ MẠNG")[0])
        self.assertEqual(1, detect_heading("Chương IV - Dịch vụ thư mục")[0])
        self.assertEqual(1, detect_heading("CHƯƠNG 2")[0])

    def test_recognizes_section_and_subsection(self):
        self.assertEqual((2, "1.1"), detect_heading("1.1 Tổng quan hệ thống")[:2])
        self.assertEqual((3, "1.1.1"), detect_heading("1.1.1 Cấu hình máy chủ")[:2])
        self.assertEqual((2, "2.3"), detect_heading("2.3")[:2])

    def test_does_not_treat_questions_or_options_as_headings(self):
        self.assertIsNone(detect_heading("Câu 1. DNS dùng để làm gì?"))
        self.assertIsNone(detect_heading("1.1 Máy chủ nào giữ vai trò DNS?"))
        self.assertIsNone(detect_heading("1.1 Chọn đáp án đúng về dịch vụ DNS"))
        self.assertIsNone(detect_heading("A. Máy chủ miền"))
        self.assertIsNone(detect_heading("1.1 Đây là một câu văn hoàn chỉnh."))

    def test_metadata_and_boundaries_are_preserved(self):
        text = """CHƯƠNG 1: QUẢN TRỊ MẠNG
Giới thiệu chương.
1.1 Group Policy
Group Policy quản lý cấu hình người dùng.
1.1.1 Làm mới chính sách
Chính sách được làm mới định kỳ 90 phút.
1.2 FSRM
FSRM quản lý hạn ngạch lưu trữ."""
        chunks, stats = chunk_text(text, source_file="chuong-1.pdf", strategy="hierarchical")
        self.assertFalse(stats.fallback)
        self.assertEqual((1, 2, 1), (stats.chapter_count, stats.section_count, stats.subsection_count))
        self.assertTrue(chunks)
        for chunk in chunks:
            self.assertEqual("chuong-1.pdf", chunk.metadata["source_file"])
            self.assertRegex(chunk.metadata["chunk_id"], r"^[0-9a-f]{24}$")
        fsrm = next(chunk for chunk in chunks if "FSRM quản lý" in chunk.page_content)
        self.assertIn("1.2 FSRM", fsrm.metadata["section"])
        self.assertNotIn("90 phút", fsrm.page_content)

    def test_short_subsection_is_not_split(self):
        text = "CHƯƠNG 1: MẠNG\n1.1 DNS\nDNS ánh xạ tên miền sang địa chỉ IP."
        chunks, _ = chunk_text(text, strategy="hierarchical")
        dns = [chunk for chunk in chunks if "DNS ánh xạ" in chunk.page_content]
        self.assertEqual(1, len(dns))

    def test_long_subsection_splits_only_inside_its_boundary(self):
        first = "Nội dung DNS dài. " * 100
        second = "Nội dung DHCP riêng biệt. " * 10
        text = f"CHƯƠNG 1: MẠNG\n1.1 DNS\n{first}\n1.2 DHCP\n{second}"
        chunks, _ = chunk_text(text, strategy="hierarchical", chunk_size=240, chunk_overlap=40)
        dns_chunks = [chunk for chunk in chunks if chunk.metadata["section"] == "1.1 DNS"]
        dhcp_chunks = [chunk for chunk in chunks if chunk.metadata["section"] == "1.2 DHCP"]
        self.assertGreater(len(dns_chunks), 1)
        self.assertTrue(dhcp_chunks)
        self.assertTrue(all("DHCP riêng biệt" not in chunk.page_content for chunk in dns_chunks))

    def test_unstructured_and_pdf_lost_formatting_fall_back(self):
        text = "Đây là nội dung PDF bị mất toàn bộ xuống dòng " * 80
        chunks, stats = chunk_text(text, strategy="hierarchical")
        self.assertTrue(stats.fallback)
        self.assertEqual(1.0, stats.fallback_ratio)
        self.assertGreater(len(chunks), 1)

    def test_fixed_keeps_legacy_size_and_overlap(self):
        chunks, stats = chunk_text("abc def " * 300, strategy="fixed")
        self.assertEqual("fixed", stats.strategy)
        self.assertFalse(stats.fallback)
        self.assertEqual(800, FIXED_CHUNK_SIZE)
        self.assertEqual(150, FIXED_CHUNK_OVERLAP)
        self.assertTrue(all(len(chunk.page_content) <= 800 for chunk in chunks))

    def test_hierarchy_aware_store_prioritizes_selected_heading(self):
        class Store:
            def similarity_search(self, query, k):
                return [
                    Document(page_content="a", metadata={"section": "1.1 DNS"}),
                    Document(page_content="b", metadata={"section": "2.1 Group Policy"}),
                ]
        result = HierarchyAwareStore(Store()).similarity_search("Group Policy", 1)
        self.assertEqual("b", result[0].page_content)

    def test_invalid_strategy_fails_at_startup(self):
        with self.assertRaisesRegex(ValueError, "fixed or hierarchical"):
            validate_strategy("magic")


if __name__ == "__main__":
    unittest.main()
