/**
 * SIE 2028 - app.js
 */
import { loadCTX }         from "./core/data.js";
import { state }           from "./core/state.js";
import { toast }           from "./ui/toast.js";
import { mountGlobalControls,
         renderDashboard,
         renderMapa,
         renderSimulador,
         renderPotencial,
         renderMovilizacion,
         renderObjetivo,
         renderAuditoria,
         renderBoleta,
         exportarPDF }     from "./ui/views.js";

var ROUTES = [
  { id:"dashboard",    label:"Dashboard",    fn: renderDashboard    },
  { id:"mapa",         label:"Mapa",         fn: renderMapa         },
  { id:"simulador",    label:"Simulador",    fn: renderSimulador    },
  { id:"potencial",    label:"Potencial",    fn: renderPotencial    },
  { id:"movilizacion", label:"Movilizacion", fn: renderMovilizacion },
  { id:"objetivo",     label:"Objetivo",     fn: renderObjetivo     },
  { id:"boleta",       label:"Boleta unica", fn: renderBoleta       },
  { id:"auditoria",    label:"Auditoria",    fn: renderAuditoria    },
];

var ctx = null;
var currentRoute = "dashboard";
var rendering = false;

async function render(routeId) {
  if (rendering) return;
  rendering = true;
  try {
    if (!ctx) {
      document.getElementById("view").innerHTML = "<div class=\"loading\">Cargando datos...</div>";
      ctx = await loadCTX();
    }
    currentRoute = routeId;
    var btns = document.querySelectorAll(".nav-btn");
    btns.forEach(function(b) {
      b.classList.toggle("active", b.dataset.route === routeId);
    });
    history.replaceState({}, "", "#" + routeId);
    var route = null;
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i].id === routeId) { route = ROUTES[i]; break; }
    }
    if (!route) route = ROUTES[0];
    route.fn(state, ctx);
    var expBtn = document.getElementById("btn-export");
    if (expBtn) {
      var show = routeId === "dashboard" || routeId === "simulador" || routeId === "auditoria";
      expBtn.style.display = show ? "" : "none";
    }
  } catch(e) {
    console.error("[SIE]", e);
    toast("Error: " + e.message);
    document.getElementById("view").innerHTML = "<div class=\"error-msg\">Error: " + e.message + "</div>";
  } finally {
    rendering = false;
  }
}

function initTheme() {
  var saved = localStorage.getItem("sie28-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  var btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.textContent = saved === "dark" ? "Claro" : "Oscuro";
  btn.addEventListener("click", function() {
    var cur  = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("sie28-theme", next);
    btn.textContent = next === "dark" ? "Claro" : "Oscuro";
  });
}

function boot() {
  initTheme();
  var nav = document.getElementById("nav");
  var navHtml = "";
  for (var i = 0; i < ROUTES.length; i++) {
    navHtml += "<button class=\"nav-btn\" data-route=\"" + ROUTES[i].id + "\">" + ROUTES[i].label + "</button>";
  }
  nav.innerHTML = navHtml;
  nav.addEventListener("click", function(e) {
    var btn = e.target.closest(".nav-btn");
    if (btn) render(btn.dataset.route);
  });
  mountGlobalControls(state);
  state.recomputeAndRender = function() { render(currentRoute); };
  var expBtn = document.getElementById("btn-export");
  if (expBtn) {
    expBtn.style.display = "none";
    expBtn.addEventListener("click", function() { exportarPDF(ctx, state); });
  }
  var initial = location.hash.replace("#", "") || "dashboard";
  var validInitial = false;
  for (var i = 0; i < ROUTES.length; i++) {
    if (ROUTES[i].id === initial) { validInitial = true; break; }
  }
  render(validInitial ? initial : "dashboard");
  window.addEventListener("hashchange", function() {
    var id = location.hash.replace("#", "");
    if (id && id !== currentRoute) render(id);
  });
}

window.addEventListener("DOMContentLoaded", boot);
