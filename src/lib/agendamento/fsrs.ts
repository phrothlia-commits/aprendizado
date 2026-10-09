import { createEmptyCard, fsrs, generatorParameters, Rating, TypeConvert, type Card, type Grade } from "ts-fsrs";
import type { Agendador, Botao, EstadoAgendamento } from "./index";

const DIA_MS = 24 * 60 * 60 * 1000;

// Retenção-alvo de 90%, alinhada à meta de 85–90% de acerto (seção 16).
const motor = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

const NOTA: Record<Botao, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

type EstadoFsrs = EstadoAgendamento & { algoritmo: "fsrs"; card: Record<string, unknown> };

function serializar(card: Card): EstadoFsrs {
  return {
    algoritmo: "fsrs",
    card: {
      ...card,
      due: card.due.toISOString(),
      last_review: card.last_review ? card.last_review.toISOString() : null,
    },
  };
}

function desserializar(estado: EstadoAgendamento): Card {
  return TypeConvert.card((estado as EstadoFsrs).card as unknown as Card);
}

export const fsrsAgendador: Agendador = {
  algoritmo: "fsrs",
  novo(agora) {
    return serializar(createEmptyCard(agora));
  },
  revisar(estado, botao, agora) {
    const card = desserializar(estado);
    const anterior = card.last_review ? (card.due.getTime() - card.last_review.getTime()) / DIA_MS : 0;
    const { card: novo } = motor.next(card, agora, NOTA[botao]);
    return {
      estado: serializar(novo),
      proximaRevisao: novo.due,
      intervaloAnteriorDias: Math.max(0, anterior),
      intervaloNovoDias: (novo.due.getTime() - agora.getTime()) / DIA_MS,
    };
  },
};
