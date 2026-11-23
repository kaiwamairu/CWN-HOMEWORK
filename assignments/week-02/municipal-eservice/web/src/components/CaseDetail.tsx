import type { ReactNode } from 'react';
import type Database from 'better-sqlite3';
import type { Principal } from '../server/security/policy';
import { decisionPermissions, hasDecisionControls } from '../server/domain/approvals';
import { readCaseDocument } from '../server/domain/documents';
import { DecisionControls } from './approvals/DecisionControls';
import { DocumentLinks } from './documents/DocumentLinks';

/**
 * B14 shared case-detail assembly. The officer page (B08) owns facts, files, timeline and review
 * actions; this fills its two slots with B10's decision controls and issued-document block.
 * Buttons render only when the actor may use them (CONTRACT 0.5). Server-only helpers stay here,
 * never in the client component.
 */
export function officerCaseSlots(db: Database.Database, actor: Principal, caseNo: string): { decisionControls: ReactNode; documentLinks: ReactNode } {
  const can = decisionPermissions(db, actor, caseNo);
  const issued = readCaseDocument(db, caseNo);
  return {
    decisionControls: hasDecisionControls(can) ? <DecisionControls caseNo={caseNo} can={can} /> : null,
    documentLinks: issued ? <DocumentLinks document={issued} canDownload={false} /> : null,
  };
}
