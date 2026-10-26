"""No database writes or Production calls; duplicate readiness is fully isolated."""
import unittest
from unittest.mock import AsyncMock, patch
import main


class DuplicateReadinessTests(unittest.IsolatedAsyncioTestCase):
    PAIRS = {
        '180/181': ([1.0,0.0],[0.982875,0.184274]),
        '173/179': ([1.0,0.0],[0.941352,0.337427]),
        '177/182': ([1.0,0.0],[0.910590,0.413311]),
    }

    async def test_isolated_known_pairs_are_semantic_bank_matches(self):
        for label,(left,right) in self.PAIRS.items():
            first,second=map(int,label.split('/'))
            rows=[{'questionId':first,'content':'existing '+label,'embedded':False,
                   'attempts':0,'lastError':None,'queuedAt':None}]
            with self.subTest(pair=label), \
                 patch.object(main,'_wait_for_bank_snapshot',AsyncMock(return_value=rows)), \
                 patch.object(main,'_nearest_questions',return_value=[]), \
                 patch.object(main,'_embed_question',AsyncMock(side_effect=[right,left])):
                report,_=await main._duplicate_report(11,'candidate '+label,[])
                self.assertTrue(report['suspectedDuplicate'])
                self.assertEqual('duplicate_semantic_bank',report['duplicateMatch']['matchType'])
                self.assertEqual(first,report['duplicateMatch']['questionId'])

    async def test_exact_bank_match_does_not_require_persisted_vector(self):
        rows=[{'questionId':181,'content':'Hệ thống áp dụng thời gian làm mới sau bao lâu?',
               'embedded':False,'attempts':0,'lastError':None,'queuedAt':None}]
        with patch.object(main,'_wait_for_bank_snapshot',AsyncMock(return_value=rows)), \
             patch.object(main,'_nearest_questions',return_value=[]), \
             patch.object(main,'_embed_question',AsyncMock(side_effect=[[1,0],[1,0]])):
            report,_=await main._duplicate_report(11,'Hệ thống áp dụng thời gian làm mới sau bao lâu!',[])
        self.assertEqual('duplicate_exact_bank',report['duplicateMatch']['matchType'])
        self.assertEqual(1.0,report['duplicateMatch']['similarity'])

    async def test_backlog_over_limit_fails_closed(self):
        rows=[{'questionId':i,'content':'q','embedded':False} for i in range(3)]
        with patch.object(main,'DUPLICATE_ON_DEMAND_LIMIT',2), \
             patch.object(main,'DUPLICATE_EMBEDDING_WAIT_SECONDS',0), \
             patch.object(main,'_duplicate_bank_snapshot',return_value=rows):
            with self.assertRaisesRegex(RuntimeError,'backlog'):
                await main._wait_for_bank_snapshot(11)


if __name__=='__main__': unittest.main()
