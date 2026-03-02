export function getHashView(){
  const h = (location.hash || "#dashboard").replace("#","").trim();
  return h || "dashboard";
}
export function setHashView(view){ location.hash = "#" + view; }
export function onRouteChange(cb){ window.addEventListener("hashchange", cb); }
