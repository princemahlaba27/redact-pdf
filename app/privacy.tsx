import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import { PRIVACY_POLICY } from '../src/legal/policies';

export default function PrivacyPolicyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}
