import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP,
  backupFileName,
  buildBackup,
  mergeProgress,
  normalizeProgress,
  parseBackupText,
  summarizeProgress,
} from './backup';
import type { BankData, Progress } from '../types';

const BANK: BankData = {
  version: 1,
  meta: { title: '测试题库', total: 2, counters: { single: 2 }, keyTotal: 1 },
  topics: [{ id: 'k01', section: '一、示例', title: '示例考点', count: 1 }],
  questions: [
    {
      id: 'Q1',
      type: 'single',
      no: 1,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '示例单选（）',
      options: [
        { key: 'A', text: '甲' },
        { key: 'B', text: '乙' },
      ],
      answer: ['A'],
      topicIds: ['k01'],
    },
    {
      id: 'Q2',
      type: 'single',
      no: 2,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '示例单选二（）',
      options: [
        { key: 'A', text: '丙' },
        { key: 'B', text: '丁' },
      ],
      answer: ['B'],
      topicIds: [],
    },
  ],
};

function progress(partial: Partial<Progress> = {}): Progress {
  return {
    records: {
      Q1: { right: 3, wrong: 1, lastAt: 1000 },
      Q2: { right: 0, wrong: 2, lastAt: 2000 },
    },
    stars: ['Q1'],
    keyOverrides: {},
    session: {
      mode: 'all',
      label: '全量刷题',
      queue: ['Q1', 'Q2'],
      index: 1,
      results: [],
      startedAt: 1500,
      endsAt: null,
    },
    finishedSessions: 2,
    lastStudyAt: 2000,
    ...partial,
  };
}

describe('summarizeProgress', () => {
  it('数出答过多少题、对错次数、收藏与完成轮次', () => {
    expect(summarizeProgress(progress(), 2)).toEqual({
      questionCount: 2,
      answered: 2,
      right: 3,
      wrong: 3,
      stars: 1,
      finishedSessions: 2,
    });
  });

  it('空进度不炸', () => {
    const empty: Progress = {
      records: {},
      stars: [],
      keyOverrides: {},
      session: null,
      finishedSessions: 0,
      lastStudyAt: null,
    };
    expect(summarizeProgress(empty)).toMatchObject({ answered: 0, right: 0, wrong: 0, stars: 0 });
  });
});

describe('buildBackup', () => {
  it('带题库时打包题库并给出题数', () => {
    const backup = buildBackup(BANK, progress(), true, new Date('2026-11-02T08:30:00'));
    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.bank?.questions).toHaveLength(2);
    expect(backup.stats.questionCount).toBe(2);
    expect(new Date(backup.exportedAt).getTime()).toBe(new Date('2026-11-02T08:30:00').getTime());
    expect(backup.progress.records.Q1).toEqual({ right: 3, wrong: 1, lastAt: 1000 });
  });

  it('不带题库时 bank 为 null，答题记录照旧', () => {
    const backup = buildBackup(BANK, progress(), false);
    expect(backup.bank).toBeNull();
    expect(backup.stats.answered).toBe(2);
  });

  it('本机没有题库也能导出', () => {
    const backup = buildBackup(null, progress(), true);
    expect(backup.bank).toBeNull();
  });
});

describe('backupFileName', () => {
  it('带日期与时分', () => {
    expect(backupFileName(new Date('2026-11-02T08:07:00'))).toBe('KillQuestion-备份-20261102-0807.json');
  });
});

describe('parseBackupText', () => {
  it('能读回自己导出的备份', () => {
    const text = JSON.stringify(buildBackup(BANK, progress(), true, new Date('2026-11-02T08:30:00')));
    const parsed = parseBackupText(text);
    expect(parsed.progress.records.Q1).toEqual({ right: 3, wrong: 1, lastAt: 1000 });
    expect(parsed.bank?.questions).toHaveLength(2);
    expect(parsed.stats.answered).toBe(2);
  });

  it('裸 progress（没有 app 头）也认', () => {
    const parsed = parseBackupText(JSON.stringify(progress()));
    expect(parsed.progress.records.Q2).toEqual({ right: 0, wrong: 2, lastAt: 2000 });
    expect(parsed.bank).toBeNull();
  });

  it('不是 JSON 时报错', () => {
    expect(() => parseBackupText('随便一段文字')).toThrow(/不是 JSON/);
  });

  it('别的应用导出的文件报错', () => {
    expect(() => parseBackupText(JSON.stringify({ app: 'some-other-app', progress: {} }))).toThrow(
      /不是 KillQuestion 的备份/,
    );
  });

  it('没有答题记录时报错', () => {
    expect(() => parseBackupText(JSON.stringify({ app: 'killquestion', stats: {} }))).toThrow(
      /没有找到答题记录/,
    );
  });
});

describe('normalizeProgress', () => {
  it('丢掉坏记录，保留好记录', () => {
    const normalized = normalizeProgress({
      records: {
        Q1: { right: 2, wrong: 1, lastAt: 10 },
        Q2: { right: 'x', wrong: 1 },
        Q3: null,
      },
      stars: ['Q1', 'Q1', 42],
      finishedSessions: '3',
      lastStudyAt: 99,
    });
    expect(Object.keys(normalized.records)).toEqual(['Q1']);
    expect(normalized.stars).toEqual(['Q1']);
    expect(normalized.finishedSessions).toBe(3);
    expect(normalized.lastStudyAt).toBe(99);
  });

  it('认不出模式的进行中练习直接丢掉', () => {
    const normalized = normalizeProgress({
      records: {},
      session: { mode: '不认识', queue: ['Q1'], index: 0 },
    });
    expect(normalized.session).toBeNull();
  });

  it('接受合法 session', () => {
    const normalized = normalizeProgress({
      records: {},
      session: { mode: 'todoKey', label: '未完成 · 重点', queue: ['Q1'], index: 0, startedAt: 5 },
    });
    expect(normalized.session).toMatchObject({ mode: 'todoKey', index: 0, endsAt: null });
  });

  it('考试卷的题型配比跟着 session 一起恢复', () => {
    const normalized = normalizeProgress({
      records: {},
      session: {
        mode: 'exam',
        queue: ['Q1'],
        index: 0,
        startedAt: 5,
        plan: { fill: '3', single: 2.7, multi: -1, judge: 0, short: 1 },
      },
    });
    expect(normalized.session?.plan).toEqual({
      fill: 3,
      single: 2,
      multi: 0,
      judge: 0,
      short: 1,
      essay: 0,
    });
  });

  it('配比字段乱写就当没有，恢复时退回默认', () => {
    const normalized = normalizeProgress({
      records: {},
      session: { mode: 'exam', queue: ['Q1'], index: 0, startedAt: 5, plan: '不是对象' },
    });
    expect(normalized.session).not.toBeNull();
    expect(normalized.session?.plan).toBeUndefined();
  });

  it('完全不是对象时给空进度', () => {
    expect(normalizeProgress(null)).toMatchObject({ records: {}, stars: [], finishedSessions: 0 });
  });

  it('手动重点调整只留合法的布尔记录，坏值逐条丢掉', () => {
    const normalized = normalizeProgress({
      records: {},
      stars: [],
      keyOverrides: { Q1: false, Q2: true, 坏值: '是的', 空值: null, '': true },
    });
    expect(normalized.keyOverrides).toEqual({ Q1: false, Q2: true });
  });

  it('没有 keyOverrides 字段时给空对象（兼容旧备份）', () => {
    expect(normalizeProgress({ records: {}, stars: [] }).keyOverrides).toEqual({});
  });
});

describe('mergeProgress', () => {
  it('同一题次数相加、lastAt 取较晚', () => {
    const local = progress({
      records: { Q1: { right: 1, wrong: 0, lastAt: 5000 } },
      stars: ['Q2'],
      finishedSessions: 1,
      lastStudyAt: 5000,
    });
    const incoming = progress({
      records: { Q1: { right: 2, wrong: 1, lastAt: 9000 }, Q2: { right: 1, wrong: 0, lastAt: 9000 } },
      stars: ['Q1'],
      finishedSessions: 2,
      lastStudyAt: 9000,
    });
    const merged = mergeProgress(local, incoming);
    expect(merged.records.Q1).toEqual({ right: 3, wrong: 1, lastAt: 9000 });
    expect(merged.records.Q2).toEqual({ right: 1, wrong: 0, lastAt: 9000 });
    expect(merged.stars.sort()).toEqual(['Q1', 'Q2']);
    expect(merged.finishedSessions).toBe(3);
    expect(merged.lastStudyAt).toBe(9000);
  });

  it('进行中的练习以本机为准，本机没有才用备份里的', () => {
    const local = progress({ session: { ...progress().session!, label: '本机的' } });
    const incoming = progress({ session: { ...progress().session!, label: '备份里的' } });
    expect(mergeProgress(local, incoming).session?.label).toBe('本机的');

    const noLocal = progress({ session: null });
    expect(mergeProgress(noLocal, incoming).session?.label).toBe('备份里的');
  });

  it('手动重点调整合并时以本机为准，备份里的新记录补进来', () => {
    const local = progress({ keyOverrides: { Q1: true, Q2: false } });
    const incoming = progress({ keyOverrides: { Q1: false, Q3: true } });
    const merged = mergeProgress(local, incoming);
    expect(merged.keyOverrides).toEqual({ Q1: true, Q2: false, Q3: true });
  });

  it('不修改入参', () => {
    const local = progress();
    const incoming = progress();
    const snapshot = JSON.stringify(local);
    mergeProgress(local, incoming);
    expect(JSON.stringify(local)).toBe(snapshot);
  });
});
