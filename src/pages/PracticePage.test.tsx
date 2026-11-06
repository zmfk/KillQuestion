import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { validateBank } from '../data/bank';
import { useQuiz } from '../store/quiz';
import { PracticePage } from './PracticePage';

/**
 * 页面级的「不卡死」验收：题库里题都没答案时，
 * 提交按钮必须能把人送到「看答案 + 自评」，任何题也都能跳过。
 */
const BANK = {
  version: 1,
  questions: [
    {
      id: 'Q1',
      type: 'fill',
      no: 1,
      section: 'fill',
      sectionLabel: '填空题',
      stem: '没有答案的填空（ ）',
      answer: [],
      topicIds: [],
    },
    {
      id: 'Q2',
      type: 'judge',
      no: 2,
      section: 'judge',
      sectionLabel: '判断题',
      stem: '没有答案的判断题。',
      answer: [],
      topicIds: [],
    },
    {
      id: 'Q3',
      type: 'single',
      no: 3,
      section: 'choice',
      sectionLabel: '选择题',
      stem: '连选项都没有的单选（ ）',
      topicIds: [],
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PracticePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useQuiz.getState().clearBank();
  useQuiz.getState().importBankData(validateBank(JSON.parse(JSON.stringify(BANK))));
  useQuiz.getState().start('all', { ordered: true });
});

afterEach(() => {
  // globals 没开，RTL 不会自动收尾；不清理的话下一个用例会看到上一份 DOM
  cleanup();
});

describe('缺答案题库的答题页', () => {
  it('填空无答案：有输入框，提交后给自评按钮，不等于被判错', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByPlaceholderText('填写答案')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    expect(screen.getByText('没有参考答案')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '答上来了' })).toBeInTheDocument();
    expect(screen.queryByText('答错了')).not.toBeInTheDocument();
  });

  it('自评后被记为完成，能进入下一题', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '提交答案' }));
    await user.click(screen.getByRole('button', { name: '没答上来' }));

    expect(useQuiz.getState().progress.records.Q1).toEqual(
      expect.objectContaining({ right: 0, wrong: 1 }),
    );
    await user.click(screen.getByRole('button', { name: '下一题' }));
    expect(useQuiz.getState().current?.id).toBe('Q2');
  });

  it('任何题都有「跳过这题」，点了直接到下一题、不记错', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '跳过这题' }));
    expect(useQuiz.getState().current?.id).toBe('Q2');
    expect(useQuiz.getState().progress.records.Q1).toBeUndefined();
  });

  it('没选项的单选题：提交按钮可点，点了走自评（以前这里是死路）', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '跳过这题' }));
    await user.click(screen.getByRole('button', { name: '跳过这题' }));
    expect(useQuiz.getState().current?.id).toBe('Q3');

    const submit = screen.getByRole('button', { name: '提交答案' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(useQuiz.getState().awaitingSelfAssess).toBe(true);
  });
});
