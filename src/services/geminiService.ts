import { GoogleGenAI, Type } from "@google/genai";
import { DocumentAnalysisResult, ChartOfAccountEntry } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING, description: "The main date of the document (YYYY-MM-DD)" },
    type: { type: Type.STRING, description: "Document type: Facture Achat, Facture Vente, or Relevé Bancaire" },
    entries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          numero: { type: Type.STRING },
          libelle: { type: Type.STRING },
          compte: { type: Type.STRING },
          debit: { type: Type.NUMBER },
          credit: { type: Type.NUMBER },
          type: { type: Type.STRING },
          tiers: { type: Type.STRING },
          paiement: { type: Type.STRING }
        },
        required: ["date", "numero", "libelle", "compte", "debit", "credit", "type", "tiers", "paiement"]
      }
    },
    errors: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["date", "type", "entries", "errors"]
};

export async function analyzeDocument(file: File, chartOfAccounts?: ChartOfAccountEntry[]): Promise<DocumentAnalysisResult> {
  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

  const coaContext = chartOfAccounts && chartOfAccounts.length > 0 
    ? `استخدم المخطط المحاسبي التالي (Chart of Accounts) لاختيار أرقام الحسابات المناسبة:\n${chartOfAccounts.map(c => `${c.compte}: ${c.intitule}`).join('\n')}`
    : "استخدم المخطط المحاسبي المغربي القياسي (PCM).";

  const prompt = `
    أنت خبير محاسبة مغربي متخصص في المخطط المحاسبي المغربي (PCM).
    قم بتحليل هذه الوثيقة واستخراج القيود المحاسبية بدقة عالية.

    ${coaContext}

    🎯 مهمتك الأساسية:
    1. التصنيف التلقائي (Automatic Categorization):
       - حدد ما إذا كانت الوثيقة "فاتورة شراء" (Facture Achat) أو "فاتورة بيع" (Facture Vente) أو "كشف حساب" (Relevé Bancaire).
       - للتمييز بين الشراء والبيع:
         * فاتورة بيع (Vente): إذا كان اسم الشركة (صاحبة الحساب) هو المصدر للفاتورة (في الأعلى).
         * فاتورة شراء (Achat): إذا كان اسم الشركة يظهر كـ "عميل" (Client) أو "مرسل إليه" (Destinataire).
         * ابحث عن كلمات مفتاحية مثل: "Doit", "Facture n°", "Client", "Fournisseur", "ICE", "RC", "IF".

    2. استخراج البيانات:
       - التاريخ (YYYY-MM-DD)، رقم الفاتورة، اسم الطرف الثالث (Tiers)، المبالغ (HT, TVA, TTC).

    3. تطبيق قواعد PCM Maroc الصارمة:
       - مشتريات (Facture Achat):
         * مدين: حساب الصنف 6 (مثلاً 6111 للمشتريات، 6141 للخدمات) + حساب 3455 (TVA récupérable).
         * دائن: حساب 4411 (Fournisseurs).
       - مبيعات (Facture Vente):
         * مدين: حساب 3421 (Clients).
         * دائن: حساب الصنف 7 (مثلاً 7111 للمبيعات) + حساب 4455 (TVA facturée).
       - بنك (Relevé Bancaire):
         * تحليل كل سطر في كشف الحساب:
           - إذا كان المبلغ في خانة "سحب" (Débit):
             * الطرف المدين: الحساب المقابل للعملية (مثلاً 6147 للمصاريف البنكية، 4411 للموردين، 6311 للفوائد).
             * الطرف الدائن: حساب البنك 5141.
           - إذا كان المبلغ في خانة "إيداع" (Crédit):
             * الطرف المدين: حساب البنك 5141.
             * الطرف الدائن: الحساب المقابل للعملية (مثلاً 3421 للزبناء، 7311 للفوائد الدائنة).
         * قواعد اختيار الحساب (Compte):
           - ابحث في المخطط المحاسبي المستورد (coaContext) عن تطابق مع وصف العملية.
           - إذا لم يوجد تطابق، استخدم القواعد العامة:
             * "Commission", "Frais", "Service" -> 6147 (Services bancaires).
             * "Agios", "Intérêts" -> 6311 (Intérêts des emprunts et dettes).
             * "Virement", "Chèque", "Versement" -> 4411 (Fournisseurs) أو 3421 (Clients) حسب الاتجاه.
             * "TVA" -> 3455 (TVA récupérable).
             * "Prélèvement" -> حسب الجهة (مثلاً الاتصالات 6145، الكهرباء 6122).
         * تأكد من استخراج رقم الشيك أو المرجع إن وجد في خانة "الرقم".

    4. التدقيق:
       - حساب TVA تلقائياً (20%، 14%، 10%، 7%).
       - التأكد من توازن القيد (Total Débit = Total Crédit).
       - العملة: MAD.
       - البيان (Libellé): "[Type] - [Tiers] - [Numéro]"

    قم بإرجاع النتيجة بتنسيق JSON مطابق للمخطط المطلوب.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  });

  return JSON.parse(response.text || "{}") as DocumentAnalysisResult;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}
