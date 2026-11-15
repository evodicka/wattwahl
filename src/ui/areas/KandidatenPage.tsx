import { useParams } from 'react-router';
import { CandidateForm } from './kandidaten/CandidateForm';
import { CandidateList } from './kandidaten/CandidateList';

/** The candidate list (#/kandidaten) and the form of one candidate (#/kandidaten/:id). */
export function KandidatenPage() {
  const { id } = useParams();
  return id ? <CandidateForm id={id} /> : <CandidateList />;
}
