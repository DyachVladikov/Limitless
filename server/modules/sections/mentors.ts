import { randomInt } from 'node:crypto';
import type { GameContext, Route, Row } from '../../core/types';
import { all, one, update } from '../../core/sql';
import { choice, expectVersion, only } from '../../core/validation';
import { BALANCE } from '../../config/balance';

const {popupChance,ownSectionChance,popupCooldownMinutes} = BALANCE.mentors;
const popupCooldownMs = popupCooldownMinutes * 60 * 1000;
const random = () => randomInt(1000000) / 1000000;
function pick<T>(values:T[],rng:()=>number):T|undefined { return values[Math.min(values.length-1,Math.floor(rng()*values.length))]; }
function reaction(mentor:Row,event:string,rng:()=>number):Row|null {
  const phrase=pick<Row>(mentor.phrases.filter((p:Row)=>p.event===event),rng);
  if(!phrase)return null;
  return {mentor_id:mentor.id,name:mentor.name,phrase_id:phrase.id,event,mood:phrase.mood,text:phrase.text,image:mentor.images[phrase.mood]??mentor.images.default};
}
export async function mentorReactions(ctx:GameContext,rng:()=>number=random):Promise<void> {
  if(!ctx.events.length)return;
  const mentors=await all(ctx.db,'SELECT * FROM mentors ORDER BY id');
  let offered=false;
  for(const event of ctx.events) {
    if(event.type==='rank_up'||event.type==='rank_down') {
      const mentor=mentors.find(m=>m.id==='gojo');
      if(mentor)event.mentor=reaction(mentor,event.type,rng);
    } else if(event.type==='quest_completed') {
      const mentor=mentors.find(m=>m.id==='gojo'&&m.phrases.some((p:Row)=>p.event==='quest_completed'))??pick(mentors.filter(m=>m.phrases.some((p:Row)=>p.event==='quest_completed')),rng);
      if(mentor)event.mentor=reaction(mentor,'quest_completed',rng);
    } else if(event.type==='daily_completed') {
      const task=await one(ctx.db,'SELECT category,completion_action FROM tasks WHERE id=$1',[event.taskId]);
      if(task?.completion_action==='log_gym_results') {
        const reminder=pick(mentors.filter(m=>m.section==='sport'&&m.phrases.some((p:Row)=>p.event==='workout_results_reminder')),rng);
        if(reminder)event.reminder={...reaction(reminder,'workout_results_reminder',rng),href:'/do-it'};
      }
      const last=ctx.profile.last_mentor_popup_at;
      if(offered||(last&&Date.parse(ctx.now)-Date.parse(last)<popupCooldownMs)||rng()>=popupChance)continue;
      const section=task?.category==='health'?'nutrition':task?.category;
      const own=rng()<ownSectionChance;
      const eventName=own?'daily_completed':'cross_reaction';
      const candidates=mentors.filter(m=>(own?m.section===section:m.section!==section)&&m.phrases.some((p:Row)=>p.event===eventName));
      const mentor=pick(candidates,rng);
      if(mentor) {event.mentor_popup=reaction(mentor,eventName,rng);offered=true;}
    }
  }
}
export const mentorRoutes:Route[]=[
  {method:'GET',path:'/mentors',async handle(ctx) {return all(ctx.db,'SELECT * FROM mentors ORDER BY section,id');}},
  {method:'GET',path:'/mentors/page',async handle(ctx,{query}) {
    const section=choice(query.get('section'),'section',['home','study','sport','work','nutrition','rationality']);
    const mentors=await all(ctx.db,'SELECT * FROM mentors WHERE section=$1 ORDER BY id',[section]);
    const mentor=pick(mentors.filter(m=>m.phrases.some((p:Row)=>p.event==='idle')),random);
    return mentor?reaction(mentor,'idle',random):null;
  }},
  {method:'POST',path:'/mentors/popup/seen',async handle(ctx,{body}) {
    only(body,['version']);expectVersion(ctx.profile,body.version);
    ctx.profile=await update(ctx.db,'profiles',{id:1},{last_mentor_popup_at:ctx.now});
    return {last_mentor_popup_at:ctx.profile.last_mentor_popup_at,version:ctx.profile.version};
  }},
];
