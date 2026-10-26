import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTopicHierarchy,isTopicDescendant,topicSegments} from '../src/features/courses/services/topicHierarchy.ts';
const codes=['2.1','2.1.1','2.1.2','2.2','2.2.1','2.1.1.1'];
const topics=codes.map((code,i)=>({id:String(i),code,name:'Tên '+code,questionCount:i}));
const shape=nodes=>nodes.map(node=>[node.topic.code,shape(node.children)]);

test('three nested topic levels from exact segments, with original IDs and question counts',()=>{
 const tree=buildTopicHierarchy(topics,'Chương 2');
 assert.deepEqual(tree.issues,[]);
 assert.deepEqual(shape(tree.roots),[['2.1',[['2.1.1',[['2.1.1.1',[]]]],['2.1.2',[]]]],['2.2',[['2.2.1',[]]]]]);
 assert.equal(tree.roots[0].topic,topics[0]);assert.equal(tree.roots[0].topic.questionCount,0);
 assert.deepEqual(topics.map(t=>t.code),codes);
});
test('2.10 is not a child of 2.1; 2.10.1 attaches only to 2.10',()=>{
 assert.equal(isTopicDescendant('2.10','2.1'),false);
 assert.equal(isTopicDescendant('2.10.1','2.1'),false);
 assert.equal(isTopicDescendant('2.1.1.1','2.1'),true);
 const {roots,issues}=buildTopicHierarchy(['2.1','2.10','2.10.1'].map(code=>({code})),'2');
 assert.equal(roots[0].children.length,0);assert.equal(roots[1].children[0].topic.code,'2.10.1');assert.deepEqual(issues,[]);
});
test('child appearing before parent attaches by segments, never source order',()=>{
 const {roots,issues}=buildTopicHierarchy([{code:'2.1.1.1'},{code:'2.1.1'},{code:'2.1'}],'Chương 2');
 assert.deepEqual(issues,[]);assert.deepEqual(shape(roots),[['2.1',[['2.1.1',[['2.1.1.1',[]]]]]]]);
});
test('missing parent, duplicate parent and malformed legacy codes remain visible without guessing',()=>{
 for(const code of ['2..1','2.1a','2','2.1.','2 1.1','ABC'])assert.equal(topicSegments(code),null);
 const tree=buildTopicHierarchy([{code:'2.1'},{code:'2. 1'},{code:'2.1.1'},{code:'2.3.1'},{code:'legacy'}],'Chương 2');
 assert.equal(tree.roots.length,5);assert.ok(tree.issues.some(i=>i.message.includes('bị trùng')));
 assert.ok(tree.issues.some(i=>i.message.includes('không rõ ràng')));
 assert.ok(tree.issues.some(i=>i.message.includes('thiếu chủ đề cha 2.3')));
});
test('editing or removing parent recalculates hierarchy without rewriting descendants',()=>{
 const changed=structuredClone(topics);changed[0].code='2.10';
 assert.ok(buildTopicHierarchy(changed,'Chương 2').issues.some(i=>i.message.includes('thiếu chủ đề cha 2.1')));
 assert.equal(changed[1].code,'2.1.1');assert.equal(changed[5].code,'2.1.1.1');
 assert.ok(buildTopicHierarchy(topics.slice(1),'Chương 2').issues.length>0);
 assert.equal(buildTopicHierarchy(topics,'Chương 2').issues.length,0);
});
test('cross-chapter codes warn, whitespace around dots is tolerated without mutating code',()=>{
 const topic={code:'2. 1. 1'},parent={code:'2. 1'};
 assert.equal(buildTopicHierarchy([topic,parent],'Chương 2').issues.length,0);assert.equal(topic.code,'2. 1. 1');
 assert.match(buildTopicHierarchy([{code:'3.1'}],'Chương 2').issues[0].message,/không thuộc/);
});
