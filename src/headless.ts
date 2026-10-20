import { applyAnswers, headlessDone, scheduleAlarms } from './adapters/native/reviewNotify';

/**
 * 화면 없이 뒤에서 켜졌을 때 (안드로이드 앱이 꺼져 있는데 알림에서 답을 누름, HeadlessRunner.java).
 * 화면은 그리지 않고, 답을 복습 기록에 넣은 뒤 새 알림 계획을 보내고 끝낸다.
 */
void (async () => {
  try {
    await applyAnswers();
    await scheduleAlarms();
  } catch {
    /* 못 넣은 답은 휴대폰에 남아 있다가 다음에 앱이 켜질 때 들어간다 */
  } finally {
    headlessDone();
  }
})();
