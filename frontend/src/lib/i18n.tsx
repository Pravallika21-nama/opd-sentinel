import { createContext, useContext, useState, type ReactNode } from "react";

export type Locale = "en" | "hi" | "te";

const copy = {
  en: {
    intake: "Intake",
    queue: "Queue",
    rules: "Rules",
    evaluation: "Evaluation",
    status: "API status",
    age: "Age (years)",
    sex: "Sex",
    systolic: "Systolic BP",
    diastolic: "Diastolic BP",
    pulse: "Pulse",
    temp: "Temperature",
    spo2: "SpO2",
    complaint: "Chief complaint",
    conditions: "Known conditions",
    medications: "Medications",
    submit: "Submit",
    submitHint: "Enter submits the form.",
    confirm: "Confirm",
    override: "Override",
    reason: "Reason",
    department: "Department",
    level: "Triage level",
    experimental: "experimental",
    filter: "Department filter",
    all: "All departments",
    examples: "Illustrative cases",
    loading: "Working…",
    wait: "Wait",
    review: "Nurse Review",
  },
  hi: {
    intake: "प्रवेश",
    queue: "कतार",
    rules: "नियम",
    evaluation: "मूल्यांकन",
    status: "API स्थिति",
    age: "आयु (वर्ष)",
    sex: "लिंग",
    systolic: "सिस्टोलिक बीपी",
    diastolic: "डायस्टोलिक बीपी",
    pulse: "नाड़ी",
    temp: "तापमान",
    spo2: "SpO2",
    complaint: "मुख्य शिकायत",
    conditions: "ज्ञात बीमारियाँ",
    medications: "दवाएँ",
    submit: "भेजें",
    submitHint: "Enter से फॉर्म भेजें।",
    confirm: "पुष्टि",
    override: "बदलें",
    reason: "कारण",
    department: "विभाग",
    level: "ट्राइएज स्तर",
    experimental: "प्रयोगात्मक",
    filter: "विभाग छानें",
    all: "सभी विभाग",
    examples: "उदाहरण मामले",
    loading: "हो रहा है…",
    wait: "प्रतीक्षा",
    review: "Nurse Review",
  },
  te: {
    intake: "ఇన్‌టేక్",
    queue: "క్యూ",
    rules: "నియమాలు",
    evaluation: "మూల్యాంకనం",
    status: "API స్థితి",
    age: "వయస్సు (సంవత్సరాలు)",
    sex: "లింగం",
    systolic: "సిస్టోలిక్ బీపీ",
    diastolic: "డయాస్టోలిక్ బీపీ",
    pulse: "నాడి",
    temp: "ఉష్ణోగ్రత",
    spo2: "SpO2",
    complaint: "ముఖ్య ఫిర్యాదు",
    conditions: "తెలిసిన వ్యాధులు",
    medications: "మందులు",
    submit: "పంపండి",
    submitHint: "Enter తో పంపండి.",
    confirm: "నిర్ధారించండి",
    override: "మార్చండి",
    reason: "కారణం",
    department: "విభాగం",
    level: "ట్రయాజ్ స్థాయి",
    experimental: "ప్రయోగాత్మకం",
    filter: "విభాగం వడపోత",
    all: "అన్ని విభాగాలు",
    examples: "ఉదాహరణ కేసులు",
    loading: "జరుగుతోంది…",
    wait: "వేచి",
    review: "Nurse Review",
  },
} as const;

type Copy = { [K in keyof (typeof copy)["en"]]: string };

const LocaleContext = createContext<{ locale: Locale; t: Copy; setLocale: (locale: Locale) => void }>({
  locale: "en",
  t: copy.en,
  setLocale: () => undefined,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  return (
    <LocaleContext.Provider value={{ locale, t: copy[locale], setLocale }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export const levelName: Record<Locale, Record<number, string>> = {
  en: { 1: "Immediate", 2: "Emergent", 3: "Urgent", 4: "Less urgent", 5: "Non-urgent" },
  hi: { 1: "तत्काल", 2: "आपात", 3: "त्वरित", 4: "कम जरूरी", 5: "अत्यावश्यक नहीं" },
  te: { 1: "తక్షణం", 2: "అత్యవసరం", 3: "త్వరితం", 4: "తక్కువ అవసరం", 5: "అత్యవసరం కాదు" },
};
