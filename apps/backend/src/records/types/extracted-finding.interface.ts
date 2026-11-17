export interface ExtractedFinding {
  testName: string | null;
  resultDate: string | null;
  summary: string | null;
  pageNumber: number | null;
  requirementIds?: string[];
}
