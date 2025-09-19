export type QuestionType =
  | "coding"
  | "reading_comprehension"
  | "logical_reasoning"
  | "data_interpretation"
  | "math"
  | "other";

export interface ProblemStatementData {
  problem_statement: string;
  question_type?: QuestionType;
  constraints?: string;
  example_input?: string;
  example_output?: string;
  answer_expectations?: string;
  supporting_material?: string;
  evaluation_focus?: string;
  language_hint?: string;
  input_format?: {
    description: string;
    parameters: any[];
  };
  output_format?: {
    description: string;
    type: string;
    subtype: string;
  };
  complexity?: {
    time: string;
    space: string;
  };
  test_cases?: any[];
  validation_type?: string;
  difficulty?: string;
}

export type AnswerType = "code" | "analysis";

export interface SolutionPayload {
  answer_type: AnswerType;
  content: string;
  code: string;
  thoughts: string[];
  time_complexity: string | null;
  space_complexity: string | null;
  key_takeaways?: string[];
  question_type?: string;
}
