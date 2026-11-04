import unittest
from benchmarks.benchmark_retrieval import pack_whole_chunks, query_metrics, relevant_targets


def row(text,chapter=1,page=3):
    return {'text':text,'chapter':chapter,'metadata':{'page_spans':[{'page':page}]}}


class RetrievalMetricTests(unittest.TestCase):
    def test_recall_counts_distinct_gold_evidence_not_duplicate_chunks(self):
        q={'gold':[{'chapter':1,'page':3,'quote':'first evidence'},
                   {'chapter':1,'page':4,'quote':'second evidence'}]}
        ranked=[row('first evidence'),row('first evidence'),row('second evidence',page=4)]
        m=query_metrics(ranked,q)
        self.assertEqual(.5,m['recall']['1'])
        self.assertEqual(1,m['recall']['3'])
        self.assertEqual(1,m['reciprocal_rank'])

    def test_page_only_or_wrong_chapter_is_not_a_relevant_evidence_hit(self):
        q={'gold':[{'chapter':1,'page':3,'quote':'answer evidence'}]}
        self.assertFalse(relevant_targets(row('unrelated'),q))
        self.assertFalse(relevant_targets(row('answer evidence',chapter=2),q))
        self.assertFalse(relevant_targets(row('answer evidence',page=4),q))
        self.assertEqual({0},relevant_targets(row('answer\n evidence'),q))

    def test_mrr_full_and_at10_are_distinguished(self):
        q={'gold':[{'chapter':1,'page':3,'quote':'answer'}]}
        m=query_metrics([row('unrelated')]*10+[row('answer')],q)
        self.assertEqual(11,m['first_relevant_rank'])
        self.assertAlmostEqual(1/11,m['reciprocal_rank'])
        self.assertEqual(0,m['reciprocal_rank_at10'])

    def test_context_counts_alias_overhead_and_keeps_ranked_whole_prefix(self):
        rows=[row('a'*20),row('b'*40),row('c')]
        context,selected=pack_whole_chunks(rows,60)
        self.assertLessEqual(len(context),60)
        self.assertEqual([rows[0]],selected)
        self.assertIn(rows[0]['text'],context)
        self.assertNotIn('b',context)
        self.assertEqual(('',[]),pack_whole_chunks([row('x'*4800)]))


if __name__=='__main__':unittest.main()
