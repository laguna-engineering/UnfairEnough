import { AnswerButton } from '@unfairenough/ui';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: '#1a1a2e', padding: 24, display: 'grid', gap: 12, maxWidth: 420 }}>
    {children}
  </div>
);

const noop = () => {};

export const Choices = () => (
  <Stage>
    <AnswerButton answerKey="A" text="The Pacific Ocean" state="default" onPress={noop} />
    <AnswerButton answerKey="B" text="The Atlantic Ocean" state="default" onPress={noop} />
    <AnswerButton answerKey="C" text="The Indian Ocean" state="default" onPress={noop} />
    <AnswerButton answerKey="D" text="The Arctic Ocean" state="default" onPress={noop} />
  </Stage>
);

export const Selected = () => (
  <Stage>
    <AnswerButton answerKey="A" text="The Pacific Ocean" state="selected" onPress={noop} />
    <AnswerButton answerKey="B" text="The Atlantic Ocean" state="default" onPress={noop} />
  </Stage>
);

export const Reveal = () => (
  <Stage>
    <AnswerButton answerKey="A" text="The Pacific Ocean" state="correct" onPress={noop} />
    <AnswerButton answerKey="B" text="The Atlantic Ocean" state="incorrect" onPress={noop} />
    <AnswerButton answerKey="C" text="The Indian Ocean" state="disabled" onPress={noop} />
  </Stage>
);
