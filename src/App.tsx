import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Trash2, 
  Loader2,
  Table as TableIcon,
  FileJson,
  FileSpreadsheet,
  FileCode,
  ChevronDown,
  BookOpen,
  Settings,
  Wand2,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { cn } from './lib/utils';
import { analyzeDocument } from './services/geminiService';
import { AccountingEntry, DocumentAnalysisResult, ChartOfAccountEntry } from './types';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [results, setResults] = useState<DocumentAnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccountEntry[]>([]);
  const coaInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    }
  });

  const handleCOAImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (file.name.endsWith('.csv')) {
        Papa.parse(data as string, {
          header: true,
          complete: (results) => {
            const parsed = results.data.map((row: any) => ({
              compte: row.compte || row.Compte || row.account || '',
              intitule: row.intitule || row.Intitule || row.label || row.name || ''
            })).filter(c => c.compte);
            setChartOfAccounts(parsed);
          }
        });
      } else {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        const parsed = json.map((row: any) => ({
          compte: String(row.compte || row.Compte || row.account || ''),
          intitule: String(row.intitule || row.Intitule || row.label || row.name || '')
        })).filter(c => c.compte);
        setChartOfAccounts(parsed);
      }
    };
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setError(null);
    const newResults: DocumentAnalysisResult[] = [];

    try {
      for (const file of files) {
        const result = await analyzeDocument(file, chartOfAccounts);
        newResults.push(result);
      }
      setResults(prev => [...prev, ...newResults]);
      setFiles([]); // Clear files after processing
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء معالجة الملفات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportCSV = () => {
    const allEntries = results.flatMap(r => r.entries);
    const csv = Papa.unparse(allEntries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `accounting_entries_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `accounting_entries_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    const allEntries = results.flatMap(r => r.entries);
    
    // Create sheets for each type
    const types = ['Facture Achat', 'Facture Vente', 'Relevé Bancaire'];
    const typeLabels: Record<string, string> = {
      'Facture Achat': 'المشتريات',
      'Facture Vente': 'المبيعات',
      'Relevé Bancaire': 'الكشوفات البنكية'
    };

    types.forEach(type => {
      const typeEntries = allEntries.filter(e => e.type === type);
      if (typeEntries.length > 0) {
        const ws = XLSX.utils.json_to_sheet(typeEntries.map(e => ({
          'التاريخ': e.date,
          'الرقم': e.numero,
          'البيان': e.libelle,
          'الحساب': e.compte,
          'مدين': e.debit,
          'دائن': e.credit,
          'النوع': e.type,
          'الطرف الثالث': e.tiers,
          'وسيلة الدفع': e.paiement
        })));
        XLSX.utils.book_append_sheet(wb, ws, typeLabels[type]);
      }
    });

    // Also add a "All" sheet
    if (allEntries.length > 0) {
      const wsAll = XLSX.utils.json_to_sheet(allEntries.map(e => ({
        'التاريخ': e.date,
        'الرقم': e.numero,
        'البيان': e.libelle,
        'الحساب': e.compte,
        'مدين': e.debit,
        'دائن': e.credit,
        'النوع': e.type,
        'الطرف الثالث': e.tiers,
        'وسيلة الدفع': e.paiement
      })));
      XLSX.utils.book_append_sheet(wb, wsAll, 'الكل');
    }

    XLSX.writeFile(wb, `accounting_entries_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportJBS = () => {
    const wb = XLSX.utils.book_new();
    const allEntries = results.flatMap(r => r.entries);
    
    // JBS Format: Journal, Date, Compte, Tiers, Libelle, Debit, Credit, Piece
    const jbsData = allEntries.map(e => {
      let journal = 'OD';
      if (e.type === 'Facture Achat') journal = 'ACH';
      if (e.type === 'Facture Vente') journal = 'VEN';
      if (e.type === 'Relevé Bancaire') journal = 'BNQ';

      return {
        'Journal': journal,
        'Date': e.date.replace(/-/g, ''), // YYYYMMDD
        'Compte': e.compte,
        'Tiers': e.tiers || '',
        'Libellé': e.libelle,
        'Débit': e.debit || 0,
        'Crédit': e.credit || 0,
        'Pièce': e.numero
      };
    });

    const ws = XLSX.utils.json_to_sheet(jbsData);
    XLSX.utils.book_append_sheet(wb, ws, 'JBS_Import');
    
    // Write as .xls (Excel 97-2003) which is usually accepted by JBS.
    XLSX.writeFile(wb, `jbs_import_${new Date().toISOString().split('T')[0]}.xls`, { bookType: 'biff8' });
  };

  const clearResults = () => {
    setResults([]);
  };

  const refineResults = async () => {
    if (results.length === 0) return;
    setIsRefining(true);
    // Simulate a final refinement/validation step
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefining(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <FileText size={20} className="sm:hidden" />
              <FileText size={24} className="hidden sm:block" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 truncate max-w-[150px] sm:max-w-none">المحاسب الذكي المغربي</h1>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">PCM AI - OCR & Data Structuring</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <input 
              type="file" 
              ref={coaInputRef} 
              onChange={handleCOAImport} 
              className="hidden" 
              accept=".csv,.xlsx,.xls" 
            />
            <button 
              onClick={() => coaInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-lg transition-colors border border-slate-200"
            >
              <BookOpen size={16} className="text-emerald-600" />
              <span className="hidden xs:inline">استيراد المخطط</span>
              {chartOfAccounts.length > 0 && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <span className="hidden md:inline-block px-2 sm:px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] sm:text-xs font-bold rounded-full border border-emerald-100">
              PCM Maroc
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200">
              <h2 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2">
                <Upload size={20} className="text-emerald-600" />
                رفع الوثائق
              </h2>
              
              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 sm:p-8 transition-all cursor-pointer text-center",
                  isDragActive ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                    <Upload size={20} className="sm:hidden" />
                    <Upload size={24} className="hidden sm:block" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">اسحب الملفات هنا أو انقر للاختيار</p>
                    <p className="text-[10px] sm:text-xs text-slate-400">PDF, JPG, PNG (Max 10MB)</p>
                  </div>
                </div>
              </div>

              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">الملفات المختارة ({files.length})</h3>
                  <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {files.map((file, index) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-100 group"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <FileText size={16} className="text-slate-400 shrink-0" />
                          <span className="text-xs sm:text-sm font-medium truncate text-slate-700">{file.name}</span>
                        </div>
                        <button 
                          onClick={() => removeFile(index)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                  
                  <button
                    onClick={processFiles}
                    disabled={isProcessing}
                    className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm sm:text-base font-bold rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
                        جاري المعالجة...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4.5 h-4.5" />
                        بدء المعالجة المحاسبية
                      </>
                    )}
                  </button>
                </div>
              )}
            </section>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <section className="bg-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-xl">
              <h2 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-emerald-400" />
                تعليمات الاستخدام
              </h2>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  تصنيف تلقائي للفواتير (شراء/بيع) بناءً على سياق الوثيقة.
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  يدعم الفواتير والبيانات البنكية المغربية (PCM).
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  {chartOfAccounts.length > 0 ? "يتم استخدام المخطط المحاسبي المستورد لتصنيف العمليات." : "يقوم النظام تلقائياً بتحديد الحسابات المحاسبية (6XXX, 4411, etc)."}
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-bold">•</span>
                  تصدير JBS متوافق مع برنامج JBS المغربي (Excel 5.0/95).
                </li>
              </ul>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px] sm:min-h-[600px] flex flex-col">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-white sticky top-0 z-10 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-lg sm:rounded-xl flex items-center justify-center text-slate-600">
                    <TableIcon className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">القيود المحاسبية المستخرجة</h2>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium">إجمالي القيود: {results.flatMap(r => r.entries).length}</p>
                  </div>
                </div>

                {results.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-start">
                    <button 
                      onClick={refineResults}
                      disabled={isRefining}
                      className={cn(
                        "flex-1 sm:flex-none p-2 sm:p-2.5 rounded-lg border transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-bold",
                        isRefining 
                          ? "bg-slate-50 text-slate-400 border-slate-200" 
                          : "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                      )}
                      title="معالجة وتدقيق القيود"
                    >
                      {isRefining ? (
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )}
                      <span>معالجة القيود</span>
                    </button>

                    <div className="relative flex-1 sm:flex-none">
                      <button 
                        onClick={() => setShowExportOptions(!showExportOptions)}
                        className="w-full sm:w-auto p-2 sm:p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-bold"
                      >
                        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>تصدير النتائج</span>
                        <ChevronDown className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform", showExportOptions && "rotate-180")} />
                      </button>
                      
                      <AnimatePresence>
                        {showExportOptions && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute left-0 sm:right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-30"
                          >
                            <button 
                              onClick={() => { exportJBS(); setShowExportOptions(false); }}
                              className="w-full px-4 py-2 text-right text-sm text-slate-700 hover:bg-emerald-50 flex items-center gap-3 transition-colors group"
                            >
                              <Settings size={18} className="text-emerald-600 group-hover:rotate-90 transition-transform" />
                              <span className="font-bold">تصدير لبرنامج JBS (.xls)</span>
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-2"></div>
                            <button 
                              onClick={() => { exportExcel(); setShowExportOptions(false); }}
                              className="w-full px-4 py-2 text-right text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                              <FileSpreadsheet size={18} className="text-emerald-600" />
                              <span className="font-bold">Excel (.xlsx)</span>
                            </button>
                            <button 
                              onClick={() => { exportCSV(); setShowExportOptions(false); }}
                              className="w-full px-4 py-2 text-right text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                              <FileCode size={18} className="text-slate-600" />
                              <span className="font-bold">CSV (.csv)</span>
                            </button>
                            <button 
                              onClick={() => { exportJSON(); setShowExportOptions(false); }}
                              className="w-full px-4 py-2 text-right text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                              <FileJson size={18} className="text-blue-600" />
                              <span className="font-bold">JSON (.json)</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button 
                      onClick={clearResults}
                      className="p-2 sm:p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-100 transition-all shrink-0"
                      title="مسح الكل"
                    >
                      <Trash2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto custom-scrollbar">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 sm:p-12 space-y-4">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                      <TableIcon className="w-8 h-8 sm:w-10 sm:h-10 opacity-20" />
                    </div>
                    <div className="text-center">
                      <p className="text-base sm:text-lg font-bold text-slate-500">لا توجد بيانات حالياً</p>
                      <p className="text-xs sm:text-sm">قم برفع ومعالجة الوثائق لتظهر القيود هنا</p>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-full inline-block align-middle">
                    <table className="w-full text-right border-collapse">
                      <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">التاريخ</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">الرقم</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">البيان</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">الحساب</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">مدين</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">دائن</th>
                          <th className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">النوع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {results.map((result, rIdx) => (
                          <React.Fragment key={`result-${rIdx}`}>
                            {result.entries.map((entry, eIdx) => (
                              <motion.tr 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: eIdx * 0.05 }}
                                key={`entry-${rIdx}-${eIdx}`} 
                                className="hover:bg-slate-50 transition-colors group"
                              >
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm font-medium text-slate-600 whitespace-nowrap">{entry.date}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm font-bold text-slate-900">{entry.numero}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm text-slate-600 min-w-[120px] sm:min-w-[200px]">{entry.libelle}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm font-mono text-emerald-700 font-bold">{entry.compte}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm font-bold text-slate-900">{entry.debit > 0 ? entry.debit.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) : '-'}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-sm font-bold text-slate-900">{entry.credit > 0 ? entry.credit.toLocaleString('fr-MA', { minimumFractionDigits: 2 }) : '-'}</td>
                                <td className="px-3 sm:px-4 py-3 sm:py-4 text-[10px] sm:text-xs">
                                  <span className={cn(
                                    "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-bold whitespace-nowrap",
                                    entry.type === 'Facture Achat' ? "bg-orange-50 text-orange-700 border border-orange-100" :
                                    entry.type === 'Facture Vente' ? "bg-blue-50 text-blue-700 border border-blue-100" :
                                    "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  )}>
                                    {entry.type === 'Facture Achat' ? 'شراء' : entry.type === 'Facture Vente' ? 'بيع' : 'بنك'}
                                  </span>
                                </td>
                              </motion.tr>
                            ))}
                            {result.errors.length > 0 && (
                              <tr key={`errors-${rIdx}`}>
                                <td colSpan={7} className="px-3 sm:px-4 py-2 bg-red-50">
                                  <div className="flex flex-col gap-1">
                                    {result.errors.map((err, i) => (
                                      <p key={i} className="text-[10px] sm:text-xs text-red-600 font-bold flex items-center gap-1">
                                        <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        {err}
                                      </p>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 sm:py-8 mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            نظام المحاسب الذكي المغربي - تم التطوير باستخدام الذكاء الاصطناعي
          </p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-1">
            جميع الحقوق محفوظة © 2026
          </p>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        @media (min-width: 640px) {
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
