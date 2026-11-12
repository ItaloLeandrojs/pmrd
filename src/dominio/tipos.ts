export type Regional = 'CS' | 'SUL' | 'LESTE'
export type FiltroRegional = Regional | 'TODAS'
/** ML, LVR, MP e LV do plano 1; os outros 10 vêm das siglas das listas de equipes. */
export type TipoEquipe =
  | 'ML' | 'LVR' | 'MP' | 'LV'
  | 'RD' | 'LB' | 'LN' | 'MM' | 'SK' | 'GA' | 'TR' | 'RL' | 'LM' | 'MO'
export type Papel = 'admin' | 'equipe' | 'importador'
export type Tema = 'sistema' | 'claro' | 'escuro'
export type DataISO = string // 'AAAA-MM-DD'
