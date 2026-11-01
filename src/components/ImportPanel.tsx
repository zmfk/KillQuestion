import { BankImporter } from './BankImporter';

/**
 * 没有题库时的空态占位：直接给导入面板。
 * 题库不进构建产物，所以每个页面在 index 为空时都会落到这里。
 */
export function ImportPanel() {
  return <BankImporter compact />;
}
