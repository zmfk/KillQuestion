import { BankImporter } from '../components/BankImporter';
import { BackupPanel } from '../components/BackupPanel';

/** 已导入过题库的人也会来这里：换题库、补一份划重点重新标注，临走导一份备份。 */
export function ImportPage() {
  return (
    <>
      <BankImporter />
      <BackupPanel />
    </>
  );
}
