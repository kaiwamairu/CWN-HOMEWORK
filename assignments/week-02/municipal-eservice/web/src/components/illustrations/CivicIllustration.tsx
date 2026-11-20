export const ART_IDS=['art-building','art-counter','art-certificate','art-shop','art-house','art-stamp','art-folder','art-coins','art-person'] as const;
export function CivicIllustration({symbol,title,size=96}:{symbol:typeof ART_IDS[number];title?:string;size?:number}){
 return <svg width={size} height={size} role={title?'img':undefined} aria-label={title} aria-hidden={title?undefined:true}><use href={`/illustrations/civic-illustrations.svg#${symbol}`} /></svg>;
}
