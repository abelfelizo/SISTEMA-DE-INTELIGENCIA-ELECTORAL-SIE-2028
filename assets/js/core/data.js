// ===============================
// SIE 2028 - DATA LOADER ESTABLE
// Compatible 100% con GitHub Pages
// ===============================

async function loadJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error("Error cargando data: " + path);
  }

  return await response.json();
}

// ===============================
// DIPUTADOS
// ===============================
export async function loadDiputados2024() {
  return await loadJson("./data/diputados_2024_votos.json");
}

// ===============================
// PRESIDENCIAL
// ===============================
export async function loadPres2024VotosProv() {
  return await loadJson("./data/pres_2024_votos_prov.json");
}

// ===============================
// PADRÓN
// ===============================
export async function loadPadron2024Provincial() {
  return await loadJson("./data/padron_2024_provincial.json");
}

export async function loadPadron2024Exterior() {
  return await loadJson("./data/padron_2024_exterior.json");
}

// ===============================
// CURULES
// ===============================
export async function loadCurules2024() {
  return await loadJson("./data/curules_2024.json");
}

// ===============================
// POLLS
// ===============================
export async function loadPolls() {
  return await loadJson("./data/polls.json");
}
