"use client";

/** Um ponto vivo no globo: uma cidade/região com visitantes online. */
export interface LiveGlobePoint {
  id: string;
  lat: number;
  lon: number;
  /** Nome do país já traduzido para exibição. */
  country: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  city: string | null;
  /** Intensidade: quantidade de utilizadores online neste ponto. */
  users: number;
}

/* -------------------------------------------------------------------------- */
/* Catálogo geográfico                                                        */
/* -------------------------------------------------------------------------- */

/** Centroides por país, para posicionar sessões reais que só têm country code. */
const COUNTRY_CENTROIDS: Record<
  string,
  { name: string; lat: number; lon: number }
> = {
  BR: { name: "Brasil", lat: -14.24, lon: -51.93 },
  PT: { name: "Portugal", lat: 39.4, lon: -8.22 },
  ES: { name: "Espanha", lat: 40.46, lon: -3.75 },
  US: { name: "Estados Unidos", lat: 37.09, lon: -95.71 },
  CA: { name: "Canadá", lat: 56.13, lon: -106.35 },
  MX: { name: "México", lat: 23.63, lon: -102.55 },
  AR: { name: "Argentina", lat: -38.42, lon: -63.62 },
  CL: { name: "Chile", lat: -35.68, lon: -71.54 },
  CO: { name: "Colômbia", lat: 4.57, lon: -74.3 },
  PE: { name: "Peru", lat: -9.19, lon: -75.02 },
  UY: { name: "Uruguai", lat: -32.52, lon: -55.77 },
  PY: { name: "Paraguai", lat: -23.44, lon: -58.44 },
  BO: { name: "Bolívia", lat: -16.29, lon: -63.59 },
  VE: { name: "Venezuela", lat: 6.42, lon: -66.59 },
  GB: { name: "Reino Unido", lat: 55.38, lon: -3.44 },
  IE: { name: "Irlanda", lat: 53.41, lon: -8.24 },
  FR: { name: "França", lat: 46.23, lon: 2.21 },
  DE: { name: "Alemanha", lat: 51.17, lon: 10.45 },
  IT: { name: "Itália", lat: 41.87, lon: 12.57 },
  NL: { name: "Países Baixos", lat: 52.13, lon: 5.29 },
  BE: { name: "Bélgica", lat: 50.5, lon: 4.47 },
  CH: { name: "Suíça", lat: 46.82, lon: 8.23 },
  AT: { name: "Áustria", lat: 47.52, lon: 14.55 },
  SE: { name: "Suécia", lat: 60.13, lon: 18.64 },
  NO: { name: "Noruega", lat: 60.47, lon: 8.47 },
  DK: { name: "Dinamarca", lat: 56.26, lon: 9.5 },
  FI: { name: "Finlândia", lat: 61.92, lon: 25.75 },
  PL: { name: "Polónia", lat: 51.92, lon: 19.15 },
  RO: { name: "Roménia", lat: 45.94, lon: 24.97 },
  GR: { name: "Grécia", lat: 39.07, lon: 21.82 },
  TR: { name: "Turquia", lat: 38.96, lon: 35.24 },
  RU: { name: "Rússia", lat: 61.52, lon: 105.32 },
  UA: { name: "Ucrânia", lat: 48.38, lon: 31.17 },
  AO: { name: "Angola", lat: -11.2, lon: 17.87 },
  MZ: { name: "Moçambique", lat: -18.67, lon: 35.53 },
  CV: { name: "Cabo Verde", lat: 16.0, lon: -24.01 },
  ZA: { name: "África do Sul", lat: -30.56, lon: 22.94 },
  NG: { name: "Nigéria", lat: 9.08, lon: 8.68 },
  EG: { name: "Egito", lat: 26.82, lon: 30.8 },
  MA: { name: "Marrocos", lat: 31.79, lon: -7.09 },
  AE: { name: "Emirados Árabes", lat: 23.42, lon: 53.85 },
  IL: { name: "Israel", lat: 31.05, lon: 34.85 },
  IN: { name: "Índia", lat: 20.59, lon: 78.96 },
  CN: { name: "China", lat: 35.86, lon: 104.2 },
  JP: { name: "Japão", lat: 36.2, lon: 138.25 },
  KR: { name: "Coreia do Sul", lat: 35.91, lon: 127.77 },
  SG: { name: "Singapura", lat: 1.35, lon: 103.82 },
  ID: { name: "Indonésia", lat: -0.79, lon: 113.92 },
  TH: { name: "Tailândia", lat: 15.87, lon: 100.99 },
  PH: { name: "Filipinas", lat: 12.88, lon: 121.77 },
  AU: { name: "Austrália", lat: -25.27, lon: 133.78 },
  NZ: { name: "Nova Zelândia", lat: -40.9, lon: 174.89 },
};

/** Resolve um country code ISO para coordenadas e nome legível. */
export function resolveCountry(
  code: string | null | undefined,
): { name: string; lat: number; lon: number } | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}

