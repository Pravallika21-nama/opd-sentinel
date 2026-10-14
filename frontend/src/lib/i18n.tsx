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
    live: "Live Triage",
    records: "Patient Records",
    auditNav: "Audit Log",
    settings: "Settings",
    clear: "Clear form",
    escalate: "Escalate for immediate assessment",
    reassess: "Request reassessment",
    search: "Search encounter ID",
    urgency: "Urgency",
    reviewStatus: "Review status",
    waiting: "Time waiting",
    encounter: "Encounter ID",
    placeholderBanner: "PLACEHOLDER — CLINICAL REVIEW REQUIRED",
    waitUnavailable: "Wait-time estimate unavailable",
    assess: "Submit for assessment",
    actions: "Nurse actions",
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
    live: "लाइव ट्राइएज",
    records: "रोगी अभिलेख",
    auditNav: "ऑडिट लॉग",
    settings: "सेटिंग्स",
    clear: "फ़ॉर्म साफ़ करें",
    escalate: "तुरंत मूल्यांकन के लिए बढ़ाएँ",
    reassess: "पुनर्मूल्यांकन माँगें",
    search: "मुलाकात आईडी खोजें",
    urgency: "तात्कालिकता",
    reviewStatus: "समीक्षा स्थिति",
    waiting: "प्रतीक्षा समय",
    encounter: "मुलाकात आईडी",
    placeholderBanner: "PLACEHOLDER — CLINICAL REVIEW REQUIRED",
    waitUnavailable: "प्रतीक्षा-समय अनुमान उपलब्ध नहीं",
    assess: "मूल्यांकन के लिए भेजें",
    actions: "Nurse actions",
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
    live: "లైవ్ ట్రయాజ్",
    records: "రోగి రికార్డులు",
    auditNav: "ఆడిట్ లాగ్",
    settings: "సెట్టింగ్‌లు",
    clear: "ఫారం తీసివేయండి",
    escalate: "తక్షణ అంచనా కోసం పెంచండి",
    reassess: "మళ్లీ అంచనా అడగండి",
    search: "ఎన్‌కౌంటర్ ఐడి వెతకండి",
    urgency: "అత్యవసరత",
    reviewStatus: "సమీక్ష స్థితి",
    waiting: "వేచి ఉన్న సమయం",
    encounter: "ఎన్‌కౌంటర్ ఐడి",
    placeholderBanner: "PLACEHOLDER — CLINICAL REVIEW REQUIRED",
    waitUnavailable: "వేచి ఉండే సమయం అంచనా లేదు",
    assess: "అంచనా కోసం పంపండి",
    actions: "Nurse actions",
  },
} as const;

type Copy = { [K in keyof (typeof copy)["en"]]: string };

const LocaleContext = createContext<{
  locale: Locale;
  t: Copy;
  setLocale: (locale: Locale) => void;
  compact: boolean;
  setCompact: (value: boolean) => void;
  demoMode: boolean;
  setDemoMode: (value: boolean) => void;
}>({
  locale: "en",
  t: copy.en,
  setLocale: () => undefined,
  compact: false,
  setCompact: () => undefined,
  demoMode: true,
  setDemoMode: () => undefined,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [compact, setCompact] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  return (
    <LocaleContext.Provider
      value={{ locale, t: copy[locale], setLocale, compact, setCompact, demoMode, setDemoMode }}
    >
      {children}
    </LocaleContext.Provider>
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
