import { readFile } from 'node:fs/promises';
export async function scenarios() {
  const course=JSON.parse(await readFile(new URL('./course.json',import.meta.url),'utf8'));
  const hierarchy=structuredClone(course); hierarchy.id='hierarchy'; hierarchy.title='Large hierarchy';
  for(let i=0;i<1000;++i) { hierarchy.scenes[0].entities.push({id:`node-${i}`,...(i?{parentId:`node-${i-1}`}:{})}); }
  const queries=structuredClone(course); queries.id='queries'; queries.title='Script queries';
  queries.scripts=[{id:'query',source:"i=>({state:{found:!!i.world.get('floor')},commands:[{kind:'query',queryId:'ray',origin:[0,3,0],direction:[0,-1,0],maxDistance:10}]})"}];
  for(let i=0;i<16;++i) { queries.scenes[0].entities.push({id:`query-${i}`,behaviors:[{id:'query',scriptId:'query'}]}); }
  const churn=structuredClone(course); churn.id='churn'; churn.title='Spawn and lifetime churn';
  churn.scripts=[{id:'spawn',source:"i=>({commands:[{kind:'spawn',entity:{id:'spawn-'+i.tick,gameplay:{lifetimeTicks:4}}}]})"}];
  churn.scenes[0].entities.push({id:'spawner',behaviors:[{id:'spawn',scriptId:'spawn'}]});
  return {course,hierarchy,queries,churn};
}
