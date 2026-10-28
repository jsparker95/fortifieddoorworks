type Schedule = {kind:"hardware"|"door"|"frame";pages:number[];description:string};

export function scheduleSearchDescription(schedules: Schedule[]) {
  const title = {hardware:"Hardware",door:"Door/opening",frame:"Door/frame type"};
  const found=schedules.map(s=>`${title[s.kind]} schedules on PDF pages ${s.pages.join(", ")}. ${s.description}`);
  const missing=([
    ["hardware","No hardware component schedule was confirmed."],
    ["door","No door/opening schedule table was confirmed."],
    ["frame","No door/frame type drawings were confirmed."],
  ] as const).filter(([kind])=>!schedules.some(s=>s.kind===kind)).map(([,message])=>message);
  return [...found,...missing,...(!schedules.length?["Floor plans, when present, will be inspected for supported door observations."]:[])].join(" ");
}
