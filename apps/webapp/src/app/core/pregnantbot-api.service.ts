import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TelegramApiService } from './telegram-api.service';

export interface Cycle {
  id: string;
  startDate: string;
  status: string;
  checklist?: ChecklistItem[];
}
export interface ChecklistItem {
  requirementId?: string;
  requirement?: {
    id: string;
    name?: string;
    title?: string;
    description?: string | null;
    patientApplicability?: 'wife' | 'husband' | 'both';
    cycleDayHint?: number | null;
    validityDays?: number | null;
    branchMetadata?: Record<string, unknown> | null;
  };
  status: string;
  resultId?: string | null;
}
export interface RecordFile {
  id: string;
  originalName: string;
  uploadedBy: string;
  uploadedAt: string;
  results?: MedicalResult[];
}
export interface UploadResponse {
  file: RecordFile;
  result: MedicalResult;
}
export type PatientRole = 'wife' | 'husband';
export interface CurrentUserResponse {
  patientRole: PatientRole;
  telegramUserId: string;
}
export interface MedicalResult {
  id: string;
  versionNumber: number;
  testName?: string;
  resultDate?: string;
  summary?: string;
  extractedFindings?: ExtractedFinding[] | null;
  matchedFindings?: ChecklistMatchedFinding[];
  normality?: 'normal' | 'abnormal' | null;
  interpretationStatus: string;
  supersededBy?: string | null;
  requirements?: { id: string; name?: string }[];
}
export interface ExtractedFinding {
  testName: string | null;
  resultDate: string | null;
  summary: string | null;
  pageNumber: number | null;
  requirementIds?: string[];
}
export interface ChecklistMatchedFinding extends ExtractedFinding {
  findingIndex: number;
  requirementIds: string[];
}
@Injectable({ providedIn: 'root' })
export class PregnantBotApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(TelegramApiService);
  private options() {
    return { headers: this.auth.authHeaders() };
  }
  currentUser(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>('/api/auth/me', this.options());
  }
  cycles(): Observable<Cycle[]> {
    return this.http.get<Cycle[]>('/api/cycles', this.options());
  }
  cycle(id: string): Observable<Cycle> {
    return this.http.get<Cycle>(`/api/cycles/${encodeURIComponent(id)}`, this.options());
  }
  createCycle(startDate: string): Observable<Cycle> {
    return this.http.post<Cycle>('/api/cycles', { startDate }, this.options());
  }
  updateChecklist(cycleId: string, requirementId: string, status: string): Observable<unknown> {
    return this.http.patch(
      `/api/cycles/${encodeURIComponent(cycleId)}/checklist/${encodeURIComponent(requirementId)}`,
      { status },
      this.options(),
    );
  }
  records(): Observable<RecordFile[]> {
    return this.http.get<RecordFile[]>('/api/records', this.options());
  }
  upload(file: File): Observable<UploadResponse> {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<UploadResponse>('/api/records/uploads', data, this.options());
  }
  interpret(id: string): Observable<MedicalResult> {
    return this.http.post<MedicalResult>(
      `/api/records/results/${encodeURIComponent(id)}/interpret`,
      {},
      this.options(),
    );
  }
  confirm(
    id: string,
    proposal: Partial<MedicalResult>,
    requirementIds: string[] = [],
    normality?: 'normal' | 'abnormal',
    extractedFindings?: ExtractedFinding[],
  ): Observable<MedicalResult> {
    return this.http.post<MedicalResult>(
      `/api/records/results/${encodeURIComponent(id)}/confirm`,
      {
        testName: proposal.testName,
        resultDate: proposal.resultDate,
        summary: proposal.summary,
        extractedFindings: proposal.extractedFindings,
        requirementIds,
        ...(extractedFindings ? { extractedFindings } : {}),
        ...(normality ? { normality } : {}),
      },
      this.options(),
    );
  }
  download(id: string): Observable<Blob> {
    return this.http.get(`/api/records/${encodeURIComponent(id)}/download`, {
      ...this.options(),
      responseType: 'blob',
    });
  }
}
