/** Only temporary provider throttling is retried. Credits/access failures need an operator. */
export function providerRateLimitDelay(error: unknown, now = Date.now()): number | null {
  const seen = new Set<unknown>();
  let current=error,limited=false,delay:number|undefined;
  for(let depth=0;current&&depth<6&&!seen.has(current);depth++){
    seen.add(current);
    const value=current as {name?:string;message?:string;statusCode?:number;responseHeaders?:Record<string,string>;cause?:unknown};
    if([401,402,403].includes(value.statusCode||0))return null;
    if(value.statusCode===429||/RateLimit/i.test(value.name||'')||/rate limit exceeded/i.test(value.message||''))limited=true;
    const header=value.responseHeaders?.['retry-after'];
    if(header){const seconds=Number(header);const parsed=Number.isFinite(seconds)?seconds*1000:Date.parse(header)-now;if(Number.isFinite(parsed)&&parsed>0)delay=Math.max(delay||0,parsed);}
    const match=value.message?.match(/retry\s+(?:again\s+)?after\s+(\d+(?:\.\d+)?)\s*(ms|s|seconds?|minutes?|m)\b/i);
    if(match){const unit=match[2].toLowerCase(),ms=Number(match[1])*(unit==='ms'?1:unit.startsWith('m')?60000:1000);delay=Math.max(delay||0,ms);}
    current=value.cause;
  }
  return limited?Math.min(600000,Math.max(1000,delay??60000)+1500):null;
}
