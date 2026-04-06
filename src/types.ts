export type DocumentType = 'Facture Achat' | 'Facture Vente' | 'Relevé Bancaire';

export interface AccountingEntry {
  date: string;
  numero: string;
  libelle: string;
  compte: string;
  debit: number;
  credit: number;
  type: DocumentType;
  tiers: string;
  paiement: string;
}

export interface ChartOfAccountEntry {
  compte: string;
  intitule: string;
}

export interface DocumentAnalysisResult {
  date: string;
  type: DocumentType;
  entries: AccountingEntry[];
  errors: string[];
}
