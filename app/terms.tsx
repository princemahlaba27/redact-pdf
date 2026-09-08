import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import { TERMS_OF_USE } from '../src/legal/policies';

export default function TermsOfUseScreen() {
  return <LegalDocumentScreen document={TERMS_OF_USE} />;
}
