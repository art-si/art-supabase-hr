import{Yt as e,on as t,qt as n,tt as r}from"./icon-Ofzn26TM.js";import{At as i,C as a,O as o}from"./runtime-core.esm-bundler-jxzlpws6.js";var s={prefix:Math.floor(Math.random()*1e4),current:0},c=Symbol(`elIdInjection`),l=()=>a()?o(c,s):s,u=a=>{let o=l();!e&&o===s&&t(`IdInjection`,`Looks like you are using server rendering, you must provide a id provider to ensure the hydration process to be succeed
usage: app.provide(ID_INJECTION_KEY, {
  prefix: number,
  current: number,
})`);let c=r();return n(()=>i(a)||`${c.value}-id-${o.prefix}-${o.current++}`)},d=Symbol(`formContextKey`),f=Symbol(`formItemContextKey`);export{l as i,f as n,u as r,d as t};