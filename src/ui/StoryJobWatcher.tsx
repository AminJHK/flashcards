import { useEffect, useRef } from 'react';
import { useRoute } from './router';
import { useStoryJob } from './storyJob';
import { useToast } from './toast';

/** 이야기가 완성되거나 실패하면 알린다 (읽기 탭에 있으면 화면에 이미 보이니 조용히) */
export function StoryJobWatcher() {
  const job = useStoryJob();
  const toast = useToast();
  const [a] = useRoute();
  const seen = useRef(job.seq);
  useEffect(() => {
    if (job.seq === seen.current) return;
    seen.current = job.seq;
    if (a === 'read') return;
    if (job.status === 'done') toast(`이야기 「${job.title}」가 완성됐어요. 읽기 탭에서 볼 수 있어요`);
    if (job.status === 'error') toast(`이야기를 만들지 못했어요 · ${job.error}`);
  }, [job.seq, job.status, job.title, job.error, a, toast]);
  // 어느 화면에서든 보이는 얇은 진행 막대 (만드는 동안만)
  if (job.status !== 'running') return null;
  const pct = Math.round((job.step?.pct ?? 0) * 100);
  return (
    <div className="job-top" role="progressbar" aria-label="이야기 만드는 중" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="job-top-fill" style={{ width: `${Math.max(pct, 4)}%` }} />
    </div>
  );
}
