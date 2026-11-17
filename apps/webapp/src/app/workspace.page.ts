import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { WorkspaceNavigationState } from './core/workspace-navigation-state.service';
import { TelegramApiService } from './core/telegram-api.service';
import {
  PregnantBotApi,
  Cycle,
  RecordFile,
  MedicalResult,
  ChecklistItem,
  PatientRole,
} from './core/pregnantbot-api.service';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CANONICAL: Record<string, string> = {
  [ID(1)]: 'Сифилис (anti-Treponema pallidum в крови)',
  [ID(2)]: 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  [ID(3)]: 'Гепатит B (поверхностный антиген HBsAg)',
  [ID(4)]: 'Гепатит C (antiHCV, антитела в крови)',
  [ID(5)]: 'ПЦР мазка из цервикального канала на Neisseria gon.',
  [ID(6)]: 'ПЦР мазка из цервикального канала на Trichomonas vag.',
  [ID(7)]: 'ПЦР мазка из цервикального канала на Chlamydia trach.',
  [ID(8)]: 'Гинекологический мазок (анализ на флору)',
  [ID(9)]: 'Общий анализ крови',
  [ID(10)]: 'Скорость оседания эритроцитов (СОЭ)',
  [ID(11)]: 'Общий анализ мочи',
  [ID(12)]: 'Биохимический анализ крови (АЛТ)',
  [ID(13)]: 'Биохимический анализ крови (АСТ)',
  [ID(14)]: 'Биохимический анализ крови (общий билирубин)',
  [ID(15)]: 'Биохимический анализ крови (глюкоза)',
  [ID(16)]: 'Биохимический анализ крови (мочевина)',
  [ID(17)]: 'Биохимический анализ крови (креатинин)',
  [ID(18)]: 'Коагулограмма (АЧТВ)',
  [ID(19)]: 'Коагулограмма (МНО)',
  [ID(20)]: 'Коагулограмма (фибриноген)',
  [ID(21)]: 'Антимюллеров гормон (АМГ)',
  [ID(22)]: 'Тиреотропный гормон (ТТГ)',
  [ID(23)]: 'Т4 свободный',
  [ID(24)]: 'Группа крови, резус-фактор',
  [ID(25)]: 'Цитологическое исследование соскоба с шейки матки и цервикального канала (Пап-тест)',
  [ID(26)]: 'ЭКГ',
  [ID(27)]: 'Заключение терапевта',
  [ID(28)]: 'УЗИ молочных желез (до 40 лет)',
  [ID(29)]: 'УЗИ органов малого таза',
  [ID(30)]: 'УЗИ щитовидной железы',
  [ID(31)]: 'Флюорография (по показаниям)',
  [ID(32)]: 'Онколог-маммолог (по показаниям)',
  [ID(33)]: 'Заключение генетика',
  [ID(34)]: 'Сифилис (anti-Treponema pallidum в крови)',
  [ID(35)]: 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  [ID(36)]: 'Гепатит B (поверхностный антиген HBsAg)',
  [ID(37)]: 'Гепатит C (antiHCV, антитела в крови)',
  [ID(38)]: 'Спермограмма (2-4 дня воздержания)',
  [ID(39)]: 'ПЦР (моча или эякулят) на Neisseria gon.',
  [ID(40)]: 'ПЦР (моча или эякулят) на Trichomonas vag.',
  [ID(41)]: 'ПЦР (моча или эякулят) на Chlamydia trach.',
  [ID(42)]: 'Группа крови, резус-фактор',
  [ID(43)]: 'Заключение андролога',
  [ID(44)]: 'Коагулограмма (тромбиновое время)',
  [ID(45)]: 'Коагулограмма (ПТИ)',
};
const ALIASES: Record<string, string> = {
  'anti-Treponema': 'Сифилис (anti-Treponema pallidum в крови)',
  'Syphilis (anti-Treponema)': 'Сифилис (anti-Treponema pallidum в крови)',
  'HIV Ag/Ab + P24': 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  'Combined HIV Ag/Ab + P24': 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
  HBsAg: 'Гепатит B (поверхностный антиген HBsAg)',
  'anti-HCV': 'Гепатит C (antiHCV, антитела в крови)',
  'N. gonorrhoeae cervical PCR': 'ПЦР мазка из цервикального канала на Neisseria gon.',
  'T. vaginalis cervical PCR': 'ПЦР мазка из цервикального канала на Trichomonas vag.',
  'C. trachomatis cervical PCR': 'ПЦР мазка из цервикального канала на Chlamydia trach.',
  'Flora smear': 'Гинекологический мазок (анализ на флору)',
  'Complete blood count (CBC)': 'Общий анализ крови',
  'Erythrocyte sedimentation rate (ESR)': 'Скорость оседания эритроцитов (СОЭ)',
  Urinalysis: 'Общий анализ мочи',
  ALT: 'Биохимический анализ крови (АЛТ)',
  AST: 'Биохимический анализ крови (АСТ)',
  'Total bilirubin': 'Биохимический анализ крови (общий билирубин)',
  Glucose: 'Биохимический анализ крови (глюкоза)',
  Urea: 'Биохимический анализ крови (мочевина)',
  Creatinine: 'Биохимический анализ крови (креатинин)',
  APTT: 'Коагулограмма (АЧТВ)',
  INR: 'Коагулограмма (МНО)',
  Fibrinogen: 'Коагулограмма (фибриноген)',
  'Thrombin time': 'Коагулограмма (тромбиновое время)',
  'PTI (prothrombin index)': 'Коагулограмма (ПТИ)',
  AMH: 'Антимюллеров гормон (АМГ)',
  TSH: 'Тиреотропный гормон (ТТГ)',
  'Free T4': 'Т4 свободный',
  'Blood group and Rh factor': 'Группа крови, резус-фактор',
  'Pap cytology':
    'Цитологическое исследование соскоба с шейки матки и цервикального канала (Пап-тест)',
  ECG: 'ЭКГ',
  'Therapist conclusion': 'Заключение терапевта',
  Fluorography: 'Флюорография (по показаниям)',
  'Breast ultrasound (under age 40)': 'УЗИ молочных желез (до 40 лет)',
  'Pelvic ultrasound': 'УЗИ органов малого таза',
  'Thyroid ultrasound': 'УЗИ щитовидной железы',
  'Oncologist-mammologist conclusion': 'Онколог-маммолог (по показаниям)',
  'Genetic conclusion': 'Заключение генетика',
  Spermogram: 'Спермограмма (2-4 дня воздержания)',
  'N. gonorrhoeae PCR': 'ПЦР (моча или эякулят) на Neisseria gon.',
  'T. vaginalis PCR': 'ПЦР (моча или эякулят) на Trichomonas vag.',
  'C. trachomatis PCR': 'ПЦР (моча или эякулят) на Chlamydia trach.',
  'Andrologist conclusion': 'Заключение андролога',
};
@Component({
  selector: 'app-workspace-page',
  imports: [RouterLink, DatePipe],
  template: ` <div class="content" [class.home-content]="section() === 'overview'">
    @if (authStatus() === 'authorized') {
      @if (section() === 'overview') {
        <section class="home-hero" aria-label="Основное действие">
          <img class="home-robot" src="/pregnant-robot.png" alt="Беременный робот" />
          @if (activeAttempt()) {
            <section class="primary-action upload-panel">
              @if (uploadPhase() === 'uploading' || uploadPhase() === 'processing') {
                <div class="upload-loader" role="status">
                  <span class="spinner"></span>
                  <strong>{{
                    uploadPhase() === 'uploading' ? 'Загрузка анализа' : 'Обработка анализа'
                  }}</strong>
                </div>
              } @else if (uploadPhase() === 'review' && uploadProposal()) {
                <div class="upload-review" [class.has-preview]="!!previewUrl()">
                  @if (previewUrl()) {
                    <div class="preview">
                      <img
                        [src]="previewUrl()!"
                        [alt]="selectedFile()?.name || 'Предпросмотр анализа'"
                      />
                    </div>
                  }
                  <div class="proposal">
                    @if (selectedFile(); as file) {
                      <p class="file-name">{{ file.name }}</p>
                    }
                    <section class="proposal-result">
                      <h2>Результат обработки</h2>
                      <strong>{{ uploadProposal()?.testName || 'Анализ не распознан' }}</strong>
                      @if (uploadProposal()?.resultDate) {
                        <p>Дата сдачи: {{ uploadProposal()?.resultDate | date: 'dd.MM.yyyy' }}</p>
                      }
                      @if (uploadProposal()?.summary) {
                        <p>{{ uploadProposal()?.summary }}</p>
                      }
                      @if (uploadMatches().length) {
                        <h3>Подходит к пунктам</h3>
                        @for (option of uploadMatches(); track option.id) {
                          <label class="match-option">
                            <input
                              type="checkbox"
                              [checked]="selectedFor(uploadProposal()!.id).includes(option.id)"
                              (change)="toggleUploadMatch(option.id)"
                            />
                            {{ option.name }} ·
                            {{ applicabilityLabel(option.patientApplicability) }}
                          </label>
                        }
                        @if (isUploadSpermogram()) {
                          <fieldset>
                            <legend>Оценка спермограммы</legend>
                            <label
                              ><input
                                type="radio"
                                name="upload-normality"
                                (change)="setUploadNormality('normal')"
                              />
                              Норма</label
                            >
                            <label
                              ><input
                                type="radio"
                                name="upload-normality"
                                (change)="setUploadNormality('abnormal')"
                              />
                              Есть отклонения</label
                            >
                          </fieldset>
                        }
                      } @else {
                        <p>Совпадение с чеклистом не найдено.</p>
                      }
                    </section>
                    @if (uploadMatches().length) {
                      <div class="review-actions">
                        <button
                          class="review-primary"
                          type="button"
                          [disabled]="busy() || !canConfirmUpload()"
                          (click)="confirmUpload()"
                        >
                          Подтвердить
                        </button>
                        <button class="cancel-link" type="button" (click)="resetUpload()">
                          Отмена
                        </button>
                      </div>
                    } @else {
                      <div class="review-actions">
                        <button
                          class="review-primary"
                          type="button"
                          [disabled]="!patientRole()"
                          (click)="openAssignment(uploadProposal()!)"
                        >
                          Назначить
                        </button>
                        <button class="cancel-link" type="button" (click)="resetUpload()">
                          Отмена
                        </button>
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <div class="form">
                  <input
                    id="file"
                    class="file-input"
                    type="file"
                    [disabled]="!patientRole()"
                    accept="application/pdf,image/jpeg,image/png"
                    (change)="choose($event)"
                  />
                  <label
                    class="upload-select-button"
                    [class.disabled]="!patientRole()"
                    [attr.aria-disabled]="!patientRole()"
                    for="file"
                    >Загрузить анализ</label
                  >
                </div>
              }
            </section>
          } @else {
            <h1 class="overview-title">Начать подготовку к стимуляции</h1>
            <section class="primary-action">
              <button type="button" [disabled]="busy()" (click)="createCycle()">
                Начать подготовку к стимуляции
              </button>
            </section>
          }
        </section>
      }
      @if (section() === 'cycles') {
        <h1>Попытки</h1>
        @if (cycles().length === 0 && !busy()) {
          <p>Пока нет попыток</p>
        }
        <ul class="attempt-list">
          @for (c of cycles(); track c.id) {
            <li>
              <a [routerLink]="['/cycles', c.id]">{{ c.startDate | date: 'mediumDate' }}</a>
            </li>
          }
        </ul>
      }
      @if (section() === 'cycle') {
        <a class="back-link" routerLink="/records">← Все анализы</a>
        @if (activeCycle(); as cycle) {
          <p class="selected-attempt">Подготовка от {{ cycle.startDate | date: 'dd.MM.yyyy' }}</p>
        }
      }
      @if (section() === 'records' || section() === 'cycle') {
        <header class="records-header">
          <h1>Все <em>анализы</em></h1>
        </header>
        <div class="owner-tabs" role="group" aria-label="Чьи анализы показывать">
          <button
            type="button"
            [attr.aria-pressed]="ownerFilter() === 'mine'"
            (click)="ownerFilter.set('mine')"
          >
            Мои анализы
          </button>
          <button
            type="button"
            [attr.aria-pressed]="ownerFilter() === 'partner'"
            (click)="ownerFilter.set('partner')"
          >
            Анализы партнёра
          </button>
        </div>
        @if (requirementOptions().length > 0) {
          <ul class="analysis-checklist">
            @for (item of visibleRequirementOptions(); track item.id) {
              <li>
                <input
                  type="checkbox"
                  disabled
                  [checked]="resultsForRequirement(item.id).length > 0"
                  [attr.aria-label]="
                    (resultsForRequirement(item.id).length
                      ? 'Есть результат: '
                      : 'Нет результата: ') + item.name
                  "
                />
                <button
                  class="analysis-title"
                  type="button"
                  [attr.aria-expanded]="isExpanded(item.id)"
                  (click)="toggleExpanded(item.id)"
                >
                  <span class="analysis-title-copy">
                    <span>{{ item.name }}</span>
                    <small>{{ validityRequirementLabel(item.validityDays) }}</small>
                  </span>
                  @if (resultsForRequirement(item.id).length) {
                    <span
                      class="file-count"
                      [attr.aria-label]="
                        'Прикреплено документов: ' + documentCountForRequirement(item.id)
                      "
                      >{{ documentCountForRequirement(item.id) }}</span
                    >
                  }
                </button>
              </li>
              @if (isExpanded(item.id)) {
                @for (entry of resultsForRequirement(item.id); track entry.result.id) {
                  <li class="linked-result">
                    <a
                      href="#"
                      [attr.aria-label]="'Скачать файл ' + entry.file.originalName"
                      (click)="downloadFile($event, entry.file.id, entry.file.originalName)"
                      >{{ entry.file.originalName }}</a
                    >
                    <small>
                      Сдан
                      {{ entry.result.resultDate || entry.file.uploadedAt | date: 'dd.MM.yyyy' }} ·
                      {{ ownerLabel(entry.file) }} ·
                      @if (validUntil(entry.result, item.id); as expiry) {
                        годен до {{ expiry | date: 'dd.MM.yyyy' }}
                      } @else {
                        {{ validityNote(entry.result, item.id) }}
                      }
                    </small>
                  </li>
                }
              }
            }
          </ul>
        }
        @if (unmatchedResults().length > 0) {
          <section class="unmatched">
            <h2>Не учтены</h2>
            <ul class="records-list">
              @for (entry of unmatchedResults(); track entry.result.id) {
                <li class="unmatched-file">
                  <a
                    href="#"
                    [attr.aria-label]="'Скачать файл ' + entry.file.originalName"
                    (click)="downloadFile($event, entry.file.id, entry.file.originalName)"
                    >{{ entry.file.originalName }}</a
                  >
                  @if (canManage(entry.file)) {
                    <button
                      class="secondary-button assign-button"
                      type="button"
                      [disabled]="!patientRole()"
                      (click)="openAssignment(entry.result, entry.file.uploadedBy)"
                    >
                      Назначить
                    </button>
                  }
                </li>
              }
            </ul>
          </section>
        }
        <section class="records-footer" aria-labelledby="preparation-title">
          <h2 id="preparation-title">Подготовка</h2>
          <p>Выберите подготовку, чтобы открыть её список обследований.</p>
          <button class="primary-button" type="button" (click)="openAttemptPicker()">
            Выбрать подготовку
          </button>
        </section>
      }
      @if (modal() === 'attempts') {
        <div class="modal-backdrop" (click)="closeModal()">
          <section
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attempt-modal-title"
            (click)="$event.stopPropagation()"
          >
            <button class="modal-close" type="button" aria-label="Закрыть" (click)="closeModal()">
              ×
            </button>
            <h2 id="attempt-modal-title">Выбрать подготовку</h2>
            @for (cycle of cycles(); track cycle.id) {
              <button class="modal-option" type="button" (click)="openAttempt(cycle)">
                {{ cycle.startDate | date: 'dd.MM.yyyy' }}
              </button>
            }
            <button type="button" [disabled]="busy()" (click)="createCycle()">
              Начать новую подготовку
            </button>
          </section>
        </div>
      }
      @if (modal() === 'assignment') {
        <div class="modal-backdrop" (click)="closeModal()">
          <section
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
            (click)="$event.stopPropagation()"
          >
            <button class="modal-close" type="button" aria-label="Закрыть" (click)="closeModal()">
              ×
            </button>
            <h2 id="assign-modal-title">Назначить анализ</h2>
            @if (assignmentPhase() === 'processing') {
              <div class="assignment-loader" role="status">
                <span class="spinner"></span>
                <strong>Обработка анализа</strong>
              </div>
            } @else if (assignmentPhase() === 'error') {
              <button type="button" [disabled]="busy()" (click)="retryAssignmentInterpretation()">
                Повторить обработку
              </button>
            } @else if (assignmentResult(); as result) {
              <section class="assignment-result">
                <h3>Результат обработки</h3>
                <strong>{{ result.testName || 'Анализ не распознан' }}</strong>
                @if (result.resultDate) {
                  <p>Дата сдачи: {{ result.resultDate | date: 'dd.MM.yyyy' }}</p>
                }
                @if (result.summary) {
                  <p>{{ result.summary }}</p>
                }
              </section>
              <h3>Выберите обследование</h3>
              @for (option of assignmentOptions(); track option.id) {
                <button
                  class="modal-option"
                  type="button"
                  [class.selected]="assignmentRequirementId() === option.id"
                  (click)="assignmentRequirementId.set(option.id)"
                >
                  {{ option.name }}
                </button>
              }
              @if (isAssignmentSpermogram()) {
                <fieldset>
                  <legend>Результат спермограммы</legend>
                  <label
                    ><input
                      type="radio"
                      name="assignment-normality"
                      (change)="assignmentNormality.set('normal')"
                    />
                    Норма</label
                  >
                  <label
                    ><input
                      type="radio"
                      name="assignment-normality"
                      (change)="assignmentNormality.set('abnormal')"
                    />
                    Есть отклонения</label
                  >
                </fieldset>
              }
              <button type="button" [disabled]="busy() || !canAssign()" (click)="assignSelected()">
                Назначить
              </button>
            }
          </section>
        </div>
      }
    } @else {
      <div class="access-state">
        <button type="button" (click)="retryAuthorization()">Повторить</button>
      </div>
    }
    @if (error() || message()) {
      <div
        class="toast"
        [class.toast-error]="!!error()"
        [class.toast-success]="!!message()"
        [attr.role]="error() ? 'alert' : 'status'"
        aria-live="polite"
      >
        {{ error() || message() }}
      </div>
    }
    @if (busy() && uploadPhase() === 'form') {
      <p role="status">Загрузка…</p>
    }
  </div>`,
  styles: [
    `
      .content {
        width: 100%;
        max-width: 1100px;
        margin: auto;
        padding: 46px clamp(18px, 5vw, 65px);
        overflow-wrap: anywhere;
      }
      .access-state {
        min-height: 40vh;
        display: grid;
        place-items: center;
        margin: 0;
        color: #77827d;
        text-align: center;
      }
      .content.home-content {
        width: 100%;
        max-width: none;
        min-height: 100dvh;
        margin: 0;
        padding: 0 0 var(--bottom-nav-height, 0px);
        box-sizing: border-box;
        display: flex;
      }
      .home-hero {
        width: 100%;
        min-height: calc(100dvh - var(--bottom-nav-height, 0px));
        margin: auto;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      h1 {
        font: clamp(30px, 4vw, 40px)/1.15 Georgia;
        color: #293a34;
        margin: 0;
      }
      .overview-title {
        text-align: center;
      }
      .home-robot {
        display: block;
        width: min(340px, 78vw);
        height: clamp(280px, 42dvh, 390px);
        object-fit: contain;
        margin: 0;
      }
      h1 em {
        color: #719082;
      }
      .primary-action {
        margin-top: 24px;
      }
      .home-hero .primary-action {
        margin: 0;
      }
      .upload-panel {
        min-height: 0;
        display: grid;
        place-items: center;
      }
      .upload-panel .form {
        width: min(100%, 360px);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .file-input:focus-visible + .upload-select-button {
        outline: 3px solid #293a34;
        outline-offset: 3px;
      }
      .upload-select-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 12px 22px;
        background: #527365;
        color: #fff;
        border-radius: 6px;
        cursor: pointer;
      }
      .upload-select-button.disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .upload-review {
        width: min(100%, 620px);
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: center;
        justify-items: center;
        gap: 18px;
      }
      .upload-review.has-preview {
        grid-template-columns: minmax(0, 1fr) minmax(260px, 1fr);
      }
      .file-name {
        color: #77827d;
        overflow-wrap: anywhere;
      }
      .proposal {
        width: 100%;
        text-align: center;
      }
      .proposal-result {
        padding: 18px 20px;
        border: 1px solid #a6c8ad;
        border-radius: 8px;
        background: #fbfefb;
      }
      .proposal-result h2 {
        margin: 0 0 12px;
        font-size: 22px;
        text-align: center;
      }
      .proposal-result strong {
        display: block;
      }
      .proposal-result p {
        margin-bottom: 0;
      }
      .review-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        margin-top: 20px;
      }
      .review-actions .review-primary {
        width: min(100%, 280px);
      }
      .upload-loader {
        min-height: 65vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        color: #293a34;
      }
      .toast {
        position: fixed;
        left: 50%;
        bottom: max(20px, env(safe-area-inset-bottom));
        z-index: 200;
        width: min(calc(100% - 32px), 480px);
        transform: translateX(-50%);
        padding: 14px 18px;
        border: 1px solid;
        border-radius: 8px;
        box-shadow: 0 6px 24px rgb(25 48 37 / 18%);
        text-align: center;
      }
      .toast-error {
        color: #7a2020;
        background: #fff4f2;
        border-color: #e5aaa3;
      }
      .toast-success {
        color: #244b34;
        background: #f2faf3;
        border-color: #a6c8ad;
      }
      .spinner {
        width: 38px;
        height: 38px;
        border: 3px solid #dce5df;
        border-top-color: #527365;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .preview {
        display: grid;
        place-items: center;
        min-height: 220px;
        max-height: 60vh;
        overflow: hidden;
        background: #f5f7f5;
        border-radius: 8px;
      }
      .preview img {
        max-width: 100%;
        max-height: 60vh;
        object-fit: contain;
      }
      .proposal h2 {
        margin: 0 0 12px;
        font-size: 22px;
      }
      .proposal h3 {
        margin: 20px 0 8px;
        font-size: 16px;
      }
      .match-option {
        display: flex;
        align-items: center;
        min-height: 44px;
        gap: 10px;
        padding: 6px 0;
      }
      .cancel-link {
        display: block;
        margin: 8px auto 0;
        min-height: 36px;
        padding: 4px 8px;
        color: #527365;
        background: transparent;
        text-decoration: underline;
      }
      .records-header {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 16px;
      }
      .records-footer {
        display: grid;
        justify-items: start;
        margin: 36px 0 8px;
        gap: 8px;
      }
      .records-footer h2,
      .records-footer p {
        margin: 0;
      }
      .records-footer h2 {
        font-size: 20px;
        font-weight: 500;
      }
      .records-footer p {
        color: #77827d;
        font-size: 14px;
        line-height: 1.45;
      }
      .secondary-button {
        background: transparent;
        color: #527365;
        border: 1px solid #b9c9c0;
        min-height: 36px;
        padding: 6px 10px;
        font-size: 13px;
        white-space: nowrap;
      }
      .owner-tabs {
        display: flex;
        gap: 8px;
        margin: 20px 0 12px;
        border-bottom: 1px solid #e8ece7;
      }
      .owner-tabs button {
        background: transparent;
        color: #77827d;
        border-radius: 0;
        border-bottom: 2px solid transparent;
      }
      .owner-tabs button[aria-pressed='true'] {
        color: #293a34;
        border-bottom-color: #527365;
      }
      button {
        min-height: 44px;
        background: #527365;
        color: #fff;
        border: 0;
        border-radius: 6px;
        padding: 10px 14px;
        cursor: pointer;
      }
      ul {
        padding-left: 20px;
        min-width: 0;
      }
      .records-list {
        list-style: none;
        padding-left: 0;
      }
      .records-list > li {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px 12px;
        padding: 12px 0;
        border: 0;
      }
      .analysis-checklist,
      .analysis-checklist li,
      .analysis-title,
      .linked-result,
      .linked-result small,
      .unmatched,
      .unmatched-file,
      .records-list,
      .records-list > li {
        text-align: left;
      }
      a {
        color: #527365;
      }
      .analysis-checklist {
        list-style: none;
        padding: 0;
        margin: 22px 0;
      }
      .analysis-checklist li {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 0;
        border: 0;
      }
      .analysis-title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex: 1;
        min-height: 44px;
        text-align: left;
        padding: 6px 0;
        background: transparent;
        color: #293a34;
        border-radius: 0;
      }
      .analysis-title-copy {
        display: grid;
        gap: 3px;
      }
      .analysis-title-copy small {
        color: #77827d;
        font-size: 12px;
        font-weight: 400;
        margin: 0;
      }
      .linked-result small,
      .unmatched small {
        margin: 0;
      }
      .file-count {
        min-width: 26px;
        height: 26px;
        padding: 0 7px;
        box-sizing: border-box;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: #e2eee7;
        color: #355f4c;
        font-size: 13px;
        font-weight: 700;
      }
      .analysis-checklist li.linked-result {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
        margin: 0 0 4px 32px;
        padding: 0 0 10px;
      }
      .analysis-checklist input {
        flex: 0 0 20px;
        width: 20px;
        height: 20px;
        min-height: 20px;
        margin: 0;
        opacity: 1;
        accent-color: #527365;
      }
      .unmatched {
        margin-top: 34px;
      }
      .unmatched h2 {
        font-size: 20px;
        font-weight: 500;
      }
      .unmatched-file {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border: 0;
      }
      .unmatched-file a {
        flex: 1;
      }
      .assign-button {
        min-height: 34px;
        padding: 6px 10px;
        font-size: 13px;
        color: #527365;
        background: transparent;
        border: 1px solid #b9c9c0;
        border-radius: 6px;
      }
      .primary-button {
        min-height: 44px;
        padding: 10px 14px;
        color: #fff;
        background: #527365;
        border: 0;
        border-radius: 6px;
        font-weight: 600;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgb(24 35 30 / 42%);
      }
      .modal {
        position: relative;
        width: min(100%, 520px);
        max-height: min(82vh, 760px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 24px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 16px 48px rgb(0 0 0 / 20%);
      }
      .modal h2 {
        margin: 0 40px 12px 0;
        font-size: 22px;
        font-weight: 500;
      }
      .modal h3 {
        margin: 10px 0 4px;
        font-size: 16px;
        font-weight: 500;
      }
      .assignment-result {
        padding: 12px;
        background: #fbfefb;
        border: 1px solid #a6c8ad;
        border-radius: 8px;
      }
      .assignment-result h3 {
        margin-top: 0;
      }
      .assignment-result p {
        margin: 8px 0 0;
      }
      .assignment-loader {
        display: flex;
        min-height: 120px;
        align-items: center;
        justify-content: center;
        gap: 14px;
      }
      .modal-close {
        position: absolute;
        top: 10px;
        right: 10px;
        min-width: 40px;
        min-height: 40px;
        background: transparent;
        color: #527365;
        font-size: 28px;
      }
      .modal-option {
        min-height: 44px;
        text-align: left;
        background: #f7f9f7;
        color: #293a34;
      }
      .modal-option.selected {
        outline: 2px solid #527365;
      }
      .modal fieldset {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 20px;
        border: 1px solid #e4e9e3;
        border-radius: 8px;
      }
      li {
        margin: 12px 0;
        overflow-wrap: anywhere;
      }
      .form {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        margin: 24px 0;
      }
      input {
        min-height: 44px;
        max-width: 100%;
        padding: 9px;
        border: 1px solid #ced7cf;
        border-radius: 5px;
      }
      select {
        width: 100%;
        min-height: 44px;
        max-width: 100%;
        padding: 9px;
        border: 1px solid #ced7cf;
        border-radius: 5px;
        background: #fff;
      }
      input[type='checkbox'],
      input[type='radio'] {
        width: 20px;
        height: 20px;
        min-height: 20px;
        vertical-align: middle;
        accent-color: #527365;
      }
      small {
        color: #77827d;
        margin: 0 8px;
      }
      .result {
        min-width: 0;
        width: 100%;
        padding: 8px 0 0;
        margin: 0;
        overflow-wrap: anywhere;
      }
      .result fieldset {
        min-width: 0;
        margin: 14px 0;
        padding: 12px;
        border: 1px solid #e4e9e3;
        border-radius: 8px;
      }
      .result fieldset > label {
        display: block;
        margin-bottom: 8px;
      }
      .result label,
      .checklist-item label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        max-width: 100%;
        cursor: pointer;
      }
      .checklist-item {
        list-style: none;
        margin: 14px 0;
        padding: 12px;
        background: #fff;
        border: 1px solid #e8ece7;
        border-radius: 10px;
      }
      .checklist-item label {
        flex-wrap: wrap;
      }
      .guidance {
        display: block;
        margin: 4px 0 4px 30px;
        line-height: 1.5;
      }
      .error {
        color: #a53c32;
      }
      .success {
        color: #386d4d;
      }
      @media (max-width: 600px) {
        .content {
          padding: 28px 16px calc(86px + env(safe-area-inset-bottom));
        }
        .primary-action {
          margin: 14px 0;
        }
        .form {
          align-items: stretch;
          flex-direction: column;
          gap: 8px;
        }
        .form > * {
          width: 100%;
          min-width: 0;
        }
        .records-header h1 {
          font-size: 30px;
        }
        .owner-tabs button {
          flex: 1;
          padding: 8px 4px;
          font-size: 13px;
        }
        .modal {
          padding: 20px 16px;
        }
        .upload-review,
        .upload-review.has-preview {
          grid-template-columns: 1fr;
        }
        .review-actions .review-primary {
          width: min(100%, 280px);
        }
        .preview {
          max-height: 40vh;
        }
        input[type='file'] {
          font-size: 13px;
          padding: 8px;
        }
        .result fieldset label {
          display: flex;
        }
        .checklist-item {
          padding: 12px 10px;
        }
        .guidance {
          margin-left: 28px;
        }
      }
      @media (min-width: 601px) and (max-width: 820px) {
        .content {
          padding: 36px 28px 90px;
        }
      }
    `,
  ],
})
export class WorkspacePage implements OnInit {
  private readonly apiService = inject(PregnantBotApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navigationState = inject(WorkspaceNavigationState);
  private readonly telegram = inject(TelegramApiService);
  readonly api = this.apiService;
  readonly section = signal('overview');
  readonly authStatus = signal<'checking' | 'authorized' | 'denied'>('checking');
  readonly cycles = signal<Cycle[]>([]);
  readonly records = signal<RecordFile[]>([]);
  readonly patientRole = signal<PatientRole | undefined>(undefined);
  readonly activeCycle = signal<Cycle | undefined>(undefined);
  readonly requirementOptions = signal<
    Array<{
      id: string;
      name: string;
      status: string;
      resultId: string | null;
      patientApplicability: 'wife' | 'husband' | 'both';
      validityDays: number | null;
      branchMetadata: Record<string, unknown> | null;
    }>
  >([]);
  readonly selectedRequirements = signal<Record<string, string[]>>({});
  readonly spermogramNormality = signal<Record<string, 'normal' | 'abnormal' | undefined>>({});
  readonly ownerFilter = signal<'mine' | 'partner'>('mine');
  readonly expandedRequirements = signal<Record<string, boolean>>({});
  readonly modal = signal<'attempts' | 'assignment' | null>(null);
  readonly assignmentResult = signal<MedicalResult | undefined>(undefined);
  readonly assignmentOwnerId = signal<string | undefined>(undefined);
  readonly assignmentRole = signal<PatientRole | undefined>(undefined);
  readonly assignmentPhase = signal<'idle' | 'processing' | 'review' | 'error'>('idle');
  readonly assignmentError = signal('');
  readonly assignmentRequirementId = signal('');
  readonly assignmentNormality = signal<'normal' | 'abnormal' | undefined>(undefined);
  readonly uploadPhase = signal<'form' | 'uploading' | 'processing' | 'review'>('form');
  readonly uploadProposal = signal<MedicalResult | undefined>(undefined);
  readonly previewUrl = signal<string | undefined>(undefined);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  private toastTimeout?: ReturnType<typeof setTimeout>;
  private routeDataReady = false;
  readonly selectedFile = signal<File | undefined>(undefined);
  readonly ALIASES = ALIASES;
  ngOnInit() {
    this.navigationState.setAuthenticated(false);
    this.authStatus.set('checking');
    this.api.currentUser().subscribe({
      next: ({ patientRole, telegramUserId }) => {
        if (
          (patientRole === 'wife' || patientRole === 'husband') &&
          typeof telegramUserId === 'string' &&
          telegramUserId.length > 0
        ) {
          this.patientRole.set(patientRole);
          this.telegram.setAuthenticatedUserId(telegramUserId);
          this.navigationState.setAuthenticated(true);
          this.authStatus.set('authorized');
          this.loadCurrentRouteData();
        } else {
          this.denyIdentity();
        }
      },
      error: (error) =>
        this.denyIdentity(),
    });
    this.route.data.subscribe((d) => {
      this.section.set(String(d['section'] ?? 'overview'));
      this.routeDataReady = true;
      this.loadCurrentRouteData();
    });
  }
  private loadCurrentRouteData(): void {
    if (!this.routeDataReady || !this.navigationState.isAuthenticated()) return;
    if (this.section() === 'overview' || this.section() === 'cycles') {
      this.loadCycles();
      this.loadNavigationRecords();
      this.loadRequirementOptions();
      return;
    }
    if (this.section() === 'records') {
      this.loadRecords();
      return;
    }
    if (this.section() === 'cycle') {
      this.loadCycles();
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.loadRecords(id);
    }
  }
  private denyIdentity(): void {
    this.authStatus.set('denied');
    this.patientRole.set(undefined);
    this.telegram.clearAuthenticatedUserId();
    this.navigationState.setAuthenticated(false);
    this.busy.set(false);
    this.modal.set(null);
    this.cycles.set([]);
    this.records.set([]);
    this.activeCycle.set(undefined);
    this.requirementOptions.set([]);
    this.selectedRequirements.set({});
    this.assignmentResult.set(undefined);
    this.uploadProposal.set(undefined);
    this.error.set('');
    this.message.set('');
  }
  activeAttempt(): Cycle | undefined {
    return this.cycles().find((c) => c.status === 'active');
  }
  requirementName(item: ChecklistItem): string {
    const id = item.requirementId ?? item.requirement?.id;
    return (
      (id && CANONICAL[id]) ?? item.requirement?.name ?? item.requirement?.title ?? 'Обследование'
    );
  }
  displayTest(result: MedicalResult): string {
    return ALIASES[result.testName ?? ''] ?? result.testName ?? 'Нераспознанный результат';
  }
  statusLabel(status: string): string {
    return (
      (
        {
          active: 'активный',
          complete: 'выполнено',
          completed: 'выполнено',
          pending: 'ожидает',
          proposed: 'предложен',
          confirmed: 'подтверждён',
          failed: 'ошибка',
          processing: 'обрабатывается',
          superseded: 'заменён',
          expired: 'срок истёк',
          unclassified: 'не классифицирован',
        } as Record<string, string>
      )[status] ?? 'Статус не указан'
    );
  }
  checklistGuidance(item: ChecklistItem): string[] {
    const r = item.requirement;
    if (!r) return [];
    const g: string[] = [];
    const m = r.branchMetadata ?? {};
    if (r.description)
      g.push(
        r.description === 'After 2 days of abstinence.'
          ? 'Подготовка: 2-4 дня воздержания.'
          : r.description,
      );
    const range = m['cycleDayRange'];
    if (Array.isArray(range) && range.length === 2) g.push(`Дни цикла ${range[0]}–${range[1]}`);
    else if (r.cycleDayHint) g.push(`Рекомендуемый день цикла: ${r.cycleDayHint}`);
    if (r.validityDays === null) g.push('Однократно');
    else if (typeof r.validityDays === 'number')
      g.push(`Срок действия: ${this.validityLabel(r.validityDays)}`);
    if (m['afterBleedingEnds'] === true) g.push('Запланируйте после окончания менструации.');
    if (m['underAge'] === 40) g.push('Для женщин младше 40 лет.');
    if (m['conditional'] === 'only_if_indicated') g.push('По показаниям.');
    if (m['onAbnormal'] === 'relevant_specialist')
      g.push('При отклонениях обратитесь к профильному специалисту.');
    if (m['assessContraindications'] === true)
      g.push('Терапевт оценит противопоказания к лечению и процедурам.');
    if (m['onlyIfNormal'] === true || m['validityAppliesOnlyIfNoAbnormalities'] === true)
      g.push('Срок действия применяется только при отсутствии отклонений.');
    if (m['onAbnormal'] === 'andrologist_review') g.push('При отклонениях обратитесь к андрологу.');
    if (m['rubellaIfPriorResultShowsAbsentAntibodies'])
      g.push(
        'Если прежний анализ показывает отсутствие антител к краснухе, вакцинация может отложить лечение на 1–3 месяца; можно зафиксировать информированный отказ.',
      );
    return g;
  }
  private validityLabel(d: number): string {
    return d === 30
      ? '1 месяц'
      : d === 90
        ? '3 месяца'
        : d === 180
          ? '6 месяцев'
          : d === 365
            ? '1 год'
            : `${d} дней`;
  }
  validityRequirementLabel(days: number | null): string {
    return days === null ? 'Без срока истечения' : `Годен: ${this.validityLabel(days)}`;
  }
  private showToast(text: string, kind: 'error' | 'success') {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    if (kind === 'error') {
      this.message.set('');
      this.error.set(text);
    } else {
      this.error.set('');
      this.message.set(text);
    }
    this.toastTimeout = setTimeout(() => {
      this.error.set('');
      this.message.set('');
      this.toastTimeout = undefined;
    }, 4500);
  }
  private fail(e: unknown) {
    this.busy.set(false);
    if (this.isAuthenticationFailure(e)) {
      this.denyIdentity();
      return;
    }
    const text =
      e instanceof Error
        ? this.translateError(e.message)
        : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
    this.showToast(text, 'error');
  }
  private isAuthenticationFailure(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('status' in error)) return false;
    return (error as { status?: unknown }).status === 401;
  }
  retryAuthorization() {
    window.location.reload();
  }
  private translateError(s: string): string {
    const m = s.match(/status\s+(\d{3})/i);
    const status = m?.[1];
    if (status === '0')
      return 'Нет соединения с сервером. Проверьте подключение и попробуйте ещё раз.';
    if (status === '400')
      return 'Не удалось обработать запрос. Проверьте данные и попробуйте ещё раз.';
    if (status === '401' || status === '403') return 'Операция недоступна для этого аккаунта.';
    if (status === '404') return 'Запрошенные данные не найдены.';
    if (status === '409') return 'Изменения конфликтуют с текущими данными. Обновите страницу.';
    if (status === '413') return 'Файл слишком большой.';
    if (status === '415') return 'Формат файла не поддерживается.';
    if (status === '429') return 'Слишком много запросов. Попробуйте позже.';
    if (status && Number(status) >= 500) return 'Сервис временно недоступен. Попробуйте позже.';
    return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  }
  loadCycles() {
    this.busy.set(true);
    this.api.cycles().subscribe({
      next: (x) => {
        this.cycles.set(x);
        this.navigationState.setHasAttempts(x.length > 0);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }
  private setCycleRequirements(value: Cycle | undefined) {
    this.activeCycle.set(value);
    this.requirementOptions.set(
      (value?.checklist ?? [])
        .map((item) => ({
          id: item.requirementId ?? item.requirement?.id ?? '',
          name: this.requirementName(item),
          status: item.status,
          resultId: item.resultId ?? null,
          patientApplicability: item.requirement?.patientApplicability ?? 'both',
          validityDays: item.requirement?.validityDays ?? null,
          branchMetadata: item.requirement?.branchMetadata ?? null,
        }))
        .filter((item) => !!item.id),
    );
  }
  private loadRequirementOptions(cycleId?: string) {
    if (cycleId) {
      this.api.cycle(cycleId).subscribe({
        next: (cycle) => this.setCycleRequirements(cycle),
        error: (error) => this.fail(error),
      });
      return;
    }
    this.api.cycles().subscribe({
      next: (cycles) => {
        const cycle = cycles.find((item) => item.status === 'active') ?? cycles[0];
        if (!cycle) {
          this.setCycleRequirements(undefined);
          return;
        }
        this.api.cycle(cycle.id).subscribe({
          next: (value) => this.setCycleRequirements(value),
          error: (error) => this.fail(error),
        });
      },
      error: (error) => this.fail(error),
    });
  }
  private loadNavigationRecords() {
    this.api.records().subscribe({
      next: (files) => this.navigationState.setHasAnalyses(files.length > 0),
      error: (e) => this.fail(e),
    });
  }
  loadRecords(cycleId?: string) {
    this.busy.set(true);
    this.api.records().subscribe({
      next: (x) => {
        this.records.set(x);
        this.navigationState.setHasAnalyses(x.length > 0);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
    this.api.cycles().subscribe({
      next: (cs) => {
        this.navigationState.setHasAttempts(cs.length > 0);
      },
      error: (e) => this.fail(e),
    });
    this.loadRequirementOptions(cycleId);
  }
  createCycle() {
    const now = new Date();
    const startDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    this.busy.set(true);
    this.api.createCycle(startDate).subscribe({
      next: (cycle) => {
        this.busy.set(false);
        this.cycles.update((cycles) => [cycle, ...cycles]);
        this.navigationState.setHasAttempts(true);
        this.closeModal();
        this.loadRequirementOptions();
        void this.router.navigateByUrl('/');
      },
      error: (e) => this.fail(e),
    });
  }
  resultsForRequirement(requirementId: string): { file: RecordFile; result: MedicalResult }[] {
    return this.records()
      .flatMap((file) =>
        (file.results ?? [])
          .filter(
            (result) =>
              result.interpretationStatus === 'confirmed' &&
              !result.supersededBy &&
              result.requirements?.some((requirement) => requirement.id === requirementId) &&
              (this.activeCycle()?.status !== 'completed' ||
                result.id ===
                  this.requirementOptions().find((option) => option.id === requirementId)
                    ?.resultId) &&
              this.matchesOwner(file),
          )
          .map((result) => ({ file, result })),
      )
      .sort((a, b) => (b.result.resultDate ?? '').localeCompare(a.result.resultDate ?? ''));
  }
  documentCountForRequirement(requirementId: string): number {
    return new Set(this.resultsForRequirement(requirementId).map(({ file }) => file.id)).size;
  }
  ownerLabel(file: RecordFile): string {
    const currentUserId = this.telegram.currentUserId();
    if (!currentUserId) return 'владелец неизвестен';
    return file.uploadedBy === currentUserId ? 'ваш анализ' : 'анализ партнёра';
  }
  private matchesOwner(file: RecordFile): boolean {
    const userId = this.telegram.currentUserId();
    if (!userId) return this.ownerFilter() === 'partner';
    const mine = file.uploadedBy === userId;
    return this.ownerFilter() === 'mine' ? mine : !mine;
  }
  visibleRequirementOptions() {
    const role = this.patientRole();
    if (!role) return [];
    const visibleRole = this.ownerFilter() === 'mine' ? role : role === 'wife' ? 'husband' : 'wife';
    return this.requirementOptions()
      .filter(
        (option) =>
          option.patientApplicability === visibleRole || option.patientApplicability === 'both',
      )
      .sort((left, right) => {
        if (left.validityDays === null) return right.validityDays === null ? 0 : -1;
        if (right.validityDays === null) return 1;
        return right.validityDays - left.validityDays;
      });
  }
  canManage(file: RecordFile): boolean {
    const userId = this.telegram.currentUserId();
    return !!userId && file.uploadedBy === userId;
  }
  isExpanded(requirementId: string): boolean {
    return this.expandedRequirements()[requirementId] === true;
  }
  toggleExpanded(requirementId: string): void {
    this.expandedRequirements.update((expanded) => ({
      ...expanded,
      [requirementId]: !expanded[requirementId],
    }));
  }
  openAttemptPicker(): void {
    this.api.cycles().subscribe({
      next: (cycles) => {
        this.cycles.set(cycles);
        this.modal.set('attempts');
      },
      error: (error) => this.fail(error),
    });
  }
  openAttempt(cycle: Cycle): void {
    this.closeModal();
    void this.router.navigate(['/cycles', cycle.id]);
  }
  openAssignment(result: MedicalResult, uploadedBy?: string): void {
    const currentUserId = this.telegram.currentUserId();
    const ownerId =
      uploadedBy ??
      this.records().find((file) => file.results?.some((entry) => entry.id === result.id))
        ?.uploadedBy ??
      currentUserId;
    if (!currentUserId || ownerId !== currentUserId) return;
    const role = this.patientRole();
    if (!role) {
      this.showToast('Не удалось определить роль пользователя. Обновите страницу.', 'error');
      return;
    }
    this.assignmentResult.set(result);
    this.assignmentOwnerId.set(ownerId);
    this.assignmentRole.set(role);
    this.assignmentRequirementId.set('');
    this.assignmentNormality.set(undefined);
    this.assignmentError.set('');
    this.modal.set('assignment');
    if (result.interpretationStatus === 'pending') {
      this.interpretAssignment(result);
    } else {
      this.assignmentPhase.set('review');
    }
  }
  closeModal(): void {
    this.modal.set(null);
    this.assignmentResult.set(undefined);
    this.assignmentOwnerId.set(undefined);
    this.assignmentRole.set(undefined);
    this.assignmentPhase.set('idle');
    this.assignmentError.set('');
    this.assignmentRequirementId.set('');
    this.assignmentNormality.set(undefined);
  }
  retryAssignmentInterpretation(): void {
    const result = this.assignmentResult();
    if (result?.interpretationStatus === 'pending') this.interpretAssignment(result);
  }
  private interpretAssignment(result: MedicalResult): void {
    if (this.assignmentPhase() === 'processing') return;
    this.assignmentPhase.set('processing');
    this.assignmentError.set('');
    this.busy.set(true);
    this.api.interpret(result.id).subscribe({
      next: (proposal) => {
        this.busy.set(false);
        if (this.modal() !== 'assignment' || this.assignmentResult()?.id !== result.id) return;
        this.assignmentResult.set(proposal);
        this.assignmentPhase.set('review');
      },
      error: (error) => {
        this.busy.set(false);
        if (this.modal() !== 'assignment' || this.assignmentResult()?.id !== result.id) return;
        this.assignmentError.set(
          error instanceof Error
            ? this.translateError(error.message)
            : 'Не удалось обработать анализ. Попробуйте ещё раз.',
        );
        this.showToast(this.assignmentError(), 'error');
        this.assignmentPhase.set('error');
      },
    });
  }
  isAssignmentSpermogram(): boolean {
    return this.assignmentRequirementId() === ID(38);
  }
  assignmentOptions() {
    const role = this.assignmentRole();
    if (!role || this.assignmentOwnerId() !== this.telegram.currentUserId()) return [];
    return this.requirementOptions().filter(
      (option) => option.patientApplicability === role || option.patientApplicability === 'both',
    );
  }
  canAssign(): boolean {
    return (
      this.assignmentPhase() === 'review' &&
      this.assignmentOwnerId() === this.telegram.currentUserId() &&
      this.assignmentRole() === this.patientRole() &&
      !!this.assignmentRequirementId() &&
      this.assignmentOptions().some((option) => option.id === this.assignmentRequirementId()) &&
      (!this.isAssignmentSpermogram() || !!this.assignmentNormality())
    );
  }
  assignSelected(): void {
    const result = this.assignmentResult();
    const requirementId = this.assignmentRequirementId();
    if (!result || !requirementId || !this.canAssign()) return;
    const normality = this.isAssignmentSpermogram() ? this.assignmentNormality() : undefined;
    const fromUpload = this.uploadProposal()?.id === result.id;
    this.busy.set(true);
    this.assignmentError.set('');
    this.api.confirm(result.id, result, [requirementId], normality).subscribe({
      next: () => {
        this.showToast('Анализ назначен.', 'success');
        this.closeModal();
        if (fromUpload) this.resetUpload();
        this.loadRecords();
      },
      error: (error) => {
        this.busy.set(false);
        this.assignmentError.set(
          error instanceof Error
            ? this.translateError(error.message)
            : 'Не удалось назначить анализ. Попробуйте ещё раз.',
        );
        this.showToast(this.assignmentError(), 'error');
      },
    });
  }
  validUntil(result: MedicalResult, requirementId: string): Date | null {
    const option = this.requirementOptions().find((item) => item.id === requirementId);
    if (!option || option.validityDays === null || !result.resultDate) return null;
    if (
      option.branchMetadata?.['validityAppliesOnlyIfNoAbnormalities'] === true &&
      result.normality !== 'normal'
    ) {
      return null;
    }
    const match = result.resultDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + option.validityDays);
  }
  validityNote(result: MedicalResult, requirementId: string): string {
    const option = this.requirementOptions().find((item) => item.id === requirementId);
    if (
      option?.branchMetadata?.['validityAppliesOnlyIfNoAbnormalities'] === true &&
      result.normality !== 'normal'
    ) {
      return 'не годен при отклонениях';
    }
    if (option?.validityDays === null) return 'срок не ограничен';
    return 'срок неизвестен';
  }
  unmatchedResults(): { file: RecordFile; result: MedicalResult }[] {
    return this.records().flatMap((file) =>
      (file.results ?? [])
        .filter(
          (result) =>
            !result.supersededBy &&
            this.matchesOwner(file) &&
            !(
              result.interpretationStatus === 'confirmed' &&
              result.requirements?.some((requirement) =>
                this.requirementOptions().some((option) => option.id === requirement.id),
              )
            ),
        )
        .map((result) => ({ file, result })),
    );
  }
  toggle(item: ChecklistItem) {
    const c = this.activeCycle();
    const id = item.requirementId ?? item.requirement?.id;
    if (!c || !id) return;
    this.api
      .updateChecklist(c.id, id, item.status === 'complete' ? 'pending' : 'complete')
      .subscribe({
        next: () => this.api.cycle(c.id).subscribe((x) => this.activeCycle.set(x)),
        error: (e) => this.fail(e),
      });
  }
  choose(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl()!);
    this.selectedFile.set(file);
    this.previewUrl.set(
      file && file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    );
    if (file) this.upload();
  }
  upload() {
    const f = this.selectedFile();
    if (!f || !this.patientRole() || this.busy()) return;
    this.busy.set(true);
    this.uploadPhase.set('uploading');
    this.api.upload(f).subscribe({
      next: ({ file, result }) => {
        this.records.update((records) => [file, ...records.filter((item) => item.id !== file.id)]);
        if (result.interpretationStatus === 'pending') {
          this.uploadProposal.set(result);
          this.uploadPhase.set('processing');
          this.api.interpret(result.id).subscribe({
            next: (proposal) => this.showUploadReview(file.id, result, proposal),
            error: (error) => {
              this.busy.set(false);
              this.uploadPhase.set('form');
              this.fail(error);
              this.loadRecords();
            },
          });
          return;
        }

        // The upload endpoint may return an already prepared proposal. Use it directly;
        // interpreting it again would create another result version.
        this.showUploadReview(file.id, result, result);
      },
      error: (error) => {
        this.uploadPhase.set('form');
        this.fail(error);
      },
    });
  }
  private showUploadReview(fileId: string, initial: MedicalResult, proposal: MedicalResult) {
    this.uploadProposal.set(proposal);
    this.records.update((records) =>
      records.map((file) =>
        file.id === fileId
          ? {
              ...file,
              results: [
                ...(file.results ?? []).filter(
                  (entry) => entry.id !== initial.id && entry.id !== proposal.id,
                ),
                proposal,
              ],
            }
          : file,
      ),
    );
    const matches = this.matchesForProposal(proposal);
    this.selectedRequirements.update((values) => ({
      ...values,
      [proposal.id]: matches.length === 1 ? [matches[0].id] : [],
    }));
    this.busy.set(false);
    this.uploadPhase.set('review');
  }
  matchesForProposal(result: MedicalResult) {
    const name = this.displayTest(result);
    const role = this.patientRole();
    if (!role) return [];
    return this.requirementOptions().filter(
      (option) =>
        option.name === name &&
        (option.patientApplicability === role || option.patientApplicability === 'both'),
    );
  }
  uploadMatches() {
    const result = this.uploadProposal();
    return result ? this.matchesForProposal(result) : [];
  }
  toggleUploadMatch(requirementId: string) {
    const result = this.uploadProposal();
    if (!result) return;
    const current = this.selectedFor(result.id);
    this.selectedRequirements.update((values) => ({
      ...values,
      [result.id]: current.includes(requirementId)
        ? current.filter((id) => id !== requirementId)
        : [...current, requirementId],
    }));
  }
  isUploadSpermogram(): boolean {
    const result = this.uploadProposal();
    return !!result && this.selectedFor(result.id).includes(ID(38));
  }
  setUploadNormality(normality: 'normal' | 'abnormal') {
    const result = this.uploadProposal();
    if (!result) return;
    this.spermogramNormality.update((values) => ({ ...values, [result.id]: normality }));
  }
  canConfirmUpload(): boolean {
    const result = this.uploadProposal();
    if (!result) return false;
    const selected = this.selectedFor(result.id);
    return (
      selected.length > 0 && (!selected.includes(ID(38)) || !!this.spermogramNormality()[result.id])
    );
  }
  confirmUpload() {
    const result = this.uploadProposal();
    if (!result || !this.canConfirmUpload()) return;
    const selected = this.selectedFor(result.id);
    this.busy.set(true);
    this.api
      .confirm(
        result.id,
        result,
        selected,
        selected.includes(ID(38)) ? this.spermogramNormality()[result.id] : undefined,
      )
      .subscribe({
        next: () => {
          this.showToast('Анализ подтверждён.', 'success');
          this.resetUpload();
          this.loadRecords();
        },
        error: (error) => this.fail(error),
      });
  }
  resetUpload() {
    if (this.previewUrl()) URL.revokeObjectURL(this.previewUrl()!);
    this.previewUrl.set(undefined);
    this.selectedFile.set(undefined);
    this.uploadProposal.set(undefined);
    this.uploadPhase.set('form');
    this.busy.set(false);
    const input = document.getElementById('file') as HTMLInputElement | null;
    if (input) input.value = '';
  }
  interpret(r: MedicalResult) {
    this.busy.set(true);
    this.api.interpret(r.id).subscribe({
      next: () => {
        this.showToast('Результат распознан. Проверьте данные.', 'success');
        this.loadRecords();
      },
      error: (e) => this.fail(e),
    });
  }
  selectedFor(id: string): string[] {
    const selection = this.selectedRequirements()[id];
    if (selection) return selection;
    const result = this.records()
      .flatMap((file) => file.results ?? [])
      .find((item) => item.id === id);
    if (!result) return [];
    const matches = this.requirementOptions().filter(
      (option) => option.name === this.displayTest(result),
    );
    return matches.length === 1 ? [matches[0].id] : [];
  }
  selectRequirement(resultId: string, requirementId: string) {
    this.selectedRequirements.update((selection) => ({
      ...selection,
      [resultId]: requirementId ? [requirementId] : [],
    }));
  }
  applicabilityLabel(applicability: 'wife' | 'husband' | 'both'): string {
    return { wife: 'женщина', husband: 'мужчина', both: 'оба' }[applicability];
  }
  isSpermogramSelected(rid: string): boolean {
    return this.selectedFor(rid).some((id) => id === ID(38));
  }
  canConfirm(id: string): boolean {
    return !this.isSpermogramSelected(id) || !!this.spermogramNormality()[id];
  }
  setSpermogramNormality(id: string, v: 'normal' | 'abnormal') {
    this.spermogramNormality.update((a) => ({ ...a, [id]: v }));
  }
  confirm(r: MedicalResult) {
    this.busy.set(true);
    const n = this.isSpermogramSelected(r.id) ? this.spermogramNormality()[r.id] : undefined;
    this.api.confirm(r.id, r, this.selectedFor(r.id), n).subscribe({
      next: () => {
        this.showToast('Результат подтверждён.', 'success');
        this.loadRecords();
      },
      error: (e) => this.fail(e),
    });
  }
  downloadFile(event: MouseEvent, id: string, name: string) {
    event.preventDefault();
    this.api
      .download(id)
      .subscribe({ next: (b) => this.save(b, name), error: (e) => this.fail(e) });
  }
  private save(b: Blob, n: string) {
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = n;
    a.click();
    URL.revokeObjectURL(u);
  }
}
