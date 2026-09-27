import { describe, expect, it } from 'vitest';
import { inTaskFilter, normalizeTask, taskDue, validateTableCount, vietnamToday, type DemoTask } from './task-demo';
const task: DemoTask = { id: 't1', title: 'Sổ bàn tiệc nhà trai', event: 'Tiệc tối', due: '', owner: 'Minh', status: 'Cần làm' };
describe('planner demo', () => {
  it('migrates legacy sample without losing edits or trusting tag/bucket', () => {
    const old = { ...task, tag: '08/10', bucket: 'Hôm nay', outcome: 'Đã hỏi nhà hàng' };
    expect(normalizeTask(old)).toMatchObject({ kind: 'table-count', title: 'Dự tính số bàn tiệc nhà trai', outcome: 'Đã hỏi nhà hàng', due: '' });
    expect(taskDue(normalizeTask(old), '2027-10-08').label).toBe('Chưa đặt hạn');
  });
  it('uses Vietnam day, separates overdue/today/future and never treats finished as urgent', () => {
    expect(vietnamToday(new Date('2027-10-07T18:00:00Z'))).toBe('2027-10-08');
    expect(taskDue({ due: '2027-10-06', status: 'Cần làm' }, '2027-10-08').label).toBe('Quá hạn 2 ngày');
    expect(taskDue({ due: '2027-10-08', status: 'Cần làm' }, '2027-10-08').label).toBe('Hạn hôm nay');
    expect(taskDue({ due: '2027-10-09', status: 'Chờ chốt' }, '2027-10-08').label).toBe('Hạn 09/10/2027');
    expect(inTaskFilter({ ...task, due: '2027-10-08', status: 'Xong' }, 'Hôm nay', '2027-10-08')).toBe(false);
    expect(inTaskFilter({ ...task, due: '2027-10-06' }, 'Sắp hạn', '2027-10-08')).toBe(true);
    expect(inTaskFilter(task, 'Sắp hạn', '2027-10-08')).toBe(false);
  });
  it('validates nonnegative whole table counts and positive planned before Done', () => {
    expect(validateTableCount('table-count', '12', '0', 'Xong')).toBe('');
    expect(validateTableCount('table-count', '', '', 'Xong')).toMatch(/dự kiến/);
    expect(validateTableCount('table-count', '0', '0', 'Xong')).toMatch(/dự kiến/);
    expect(validateTableCount('table-count', '1.5', '0', 'Cần làm')).toMatch(/nguyên/);
    expect(validateTableCount('table-count', '2', '-1', 'Cần làm')).toMatch(/nguyên/);
    expect(validateTableCount(undefined, '', '', 'Xong')).toBe('');
  });
});