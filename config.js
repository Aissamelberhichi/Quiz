/**
 * EXAM PLATFORM — CONFIG.JS
 * Central data source for all available exams.
 * Add new exams here — the UI updates automatically.
 */

const EXAMS_CONFIG = [
  {
    id: 1,
    file: "INFORMATIQUE-JUSTICE-2025-E9.xlsx",
    title: "Réseaux Informatiques — Ministre de Justice 2025",
    etab: "Justice",
    spec: "Informatique",
    year: 2025,
    echelle: "E9",
    logo: "logos/justice.svg",
    questionCount: 60,
    duration: 60,
  },
  {
    id: 2,
    file: "INFORMATIQUE-JUSTICE-2024-E9.xlsx",
    title: "Réseaux Informatiques — Ministre de Justice 2024",
    etab: "Justice",
    spec: "Informatique",
    year: 2024,
    echelle: "E9",
    logo: "logos/justice.svg",
    questionCount: 60,
    duration: 60,
  },
  /* {
    id: 3,
    file: "INFORMATIQUE-EDUCATION-2025-E9.xlsx",
    title: "Informatique — Éducation 2025",
    etab: "Education",
    spec: "Informatique",
    year: 2025,
    echelle: "E9",
    logo: "logos/education.svg",
    questionCount: 35,
    duration: 60,
  },
  {
    id: 4,
    file: "INFORMATIQUE-EDUCATION-2024-E8.xlsx",
    title: "Informatique — Éducation 2024",
    etab: "Education",
    spec: "Informatique",
    year: 2024,
    echelle: "E8",
    logo: "logos/education.svg",
    questionCount: 35,
    duration: 60,
  },
  {
    id: 5,
    file: "GESTION-JUSTICE-2025-E7.xlsx",
    title: "Gestion — Justice 2025",
    etab: "Justice",
    spec: "Gestion",
    year: 2025,
    echelle: "E7",
    logo: "logos/justice.svg",
    questionCount: 30,
    duration: 45,
  },
  {
    id: 6,
    file: "GESTION-EDUCATION-2023-E6.xlsx",
    title: "Gestion — Éducation 2023",
    etab: "Education",
    spec: "Gestion",
    year: 2023,
    echelle: "E6",
    logo: "logos/education.svg",
    questionCount: 30,
    duration: 45,
  },
  {
    id: 7,
    file: "DROIT-JUSTICE-2024-E8.xlsx",
    title: "Droit — Justice 2024",
    etab: "Justice",
    spec: "Droit",
    year: 2024,
    echelle: "E8",
    logo: "logos/justice.svg",
    questionCount: 50,
    duration: 90,
  },
  {
    id: 8,
    file: "DROIT-EDUCATION-2024-E7.xlsx",
    title: "Droit — Éducation 2024",
    etab: "Education",
    spec: "Droit",
    year: 2024,
    echelle: "E7",
    logo: "logos/education.svg",
    questionCount: 50,
    duration: 90,
  }, */
];

// Derived filter options (auto-computed from data)
const FILTER_OPTIONS = {
  etabs: [...new Set(EXAMS_CONFIG.map((e) => e.etab))].sort(),
  specs: [...new Set(EXAMS_CONFIG.map((e) => e.spec))].sort(),
  years: [...new Set(EXAMS_CONFIG.map((e) => e.year))].sort((a, b) => b - a),
};

const ITEMS_PER_PAGE = 6;
