import { cardiacNursingZh } from './cardiacNursingZh';
import { indonesianColloquial } from './indonesianColloquial';
import { spanishIrregularEs } from './spanishIrregularEs';
import { spanishTravelEs } from './spanishTravelEs';
import type { Pack } from './types';

/** 준비된 덱 목록. 새 덱 꾸러미는 파일을 하나 만들고 여기에 추가한다. */
export const PACKS: readonly Pack[] = [cardiacNursingZh, spanishTravelEs, spanishIrregularEs, indonesianColloquial];
