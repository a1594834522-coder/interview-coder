// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { ProblemStatementData, SolutionPayload, AnswerType, QuestionType } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Extracting problem statement...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)
const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage,
  answerType
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  currentLanguage: string
  answerType: AnswerType
}) => {
  const [copied, setCopied] = useState(false)
  const textualContent = typeof content === "string" ? content : ""

  const copyToClipboard = () => {
    navigator.clipboard.writeText(textualContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-2 relative">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="mt-4 flex">
            <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
              Loading solutions...
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full relative">
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {answerType === "code" ? (
            <SyntaxHighlighter
              showLineNumbers
              language={currentLanguage == "golang" ? "go" : currentLanguage}
              style={dracula}
              customStyle={{
                maxWidth: "100%",
                margin: 0,
                padding: "1rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                backgroundColor: "rgba(22, 27, 34, 0.5)"
              }}
              wrapLongLines={true}
            >
              {textualContent}
            </SyntaxHighlighter>
          ) : (
            <div className="bg-white/5 rounded-md text-[13px] leading-[1.5] text-gray-100 p-4 whitespace-pre-wrap">
              {textualContent}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => {
  // Helper to ensure we have proper complexity values
  const formatComplexity = (complexity: string | null): string => {
    // Default if no complexity returned by LLM
    if (!complexity || complexity.trim() === "") {
      return "Complexity not available";
    }

    const bigORegex = /O\([^)]+\)/i;
    // Return the complexity as is if it already has Big O notation
    if (bigORegex.test(complexity)) {
      return complexity;
    }
    
    // Concat Big O notation to the complexity
    return `O(${complexity})`;
  };
  
  const formattedTimeComplexity = formatComplexity(timeComplexity);
  const formattedSpaceComplexity = formatComplexity(spaceComplexity);
  
  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        Complexity
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Calculating complexity...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Time:</strong> {formattedTimeComplexity}
              </div>
            </div>
          </div>
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Space:</strong> {formattedSpaceComplexity}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [answerType, setAnswerType] = useState<AnswerType>("code")
  const [keyTakeawaysData, setKeyTakeawaysData] = useState<string[] | null>(null)
  const [questionType, setQuestionType] = useState<QuestionType | null>(null)

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  const allowedQuestionTypes: QuestionType[] = [
    "coding",
    "reading_comprehension",
    "logical_reasoning",
    "data_interpretation",
    "math",
    "other"
  ];

  const normalizeQuestionType = (value?: string | null): QuestionType | null => {
    if (!value) {
      return null;
    }

    const cleaned = value.toLowerCase() as QuestionType;
    return allowedQuestionTypes.includes(cleaned) ? cleaned : null;
  };

  const hasDisplayValue = (value?: string | null): value is string => {
    if (value === undefined || value === null) {
      return false;
    }
    const normalized = value.trim();
    return normalized.length > 0 && normalized.toLowerCase() !== "n/a";
  };

  const applySolutionState = (payload: SolutionPayload | null) => {
    if (!payload) {
      setSolutionData(null);
      setThoughtsData(null);
      setTimeComplexityData(null);
      setSpaceComplexityData(null);
      setAnswerType("code");
      setKeyTakeawaysData(null);
      setQuestionType(null);
      return;
    }

    setSolutionData(payload.content ?? payload.code ?? null);
    setThoughtsData(payload.thoughts ?? null);
    setTimeComplexityData(payload.time_complexity ?? null);
    setSpaceComplexityData(payload.space_complexity ?? null);
    setAnswerType(payload.answer_type ?? "code");
    setKeyTakeawaysData(payload.key_takeaways ?? null);

    const normalized = normalizeQuestionType(payload.question_type ?? null);
    if (normalized) {
      setQuestionType(normalized);
    }
  };

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])

  const effectiveQuestionType =
    questionType ||
    normalizeQuestionType(problemStatementData?.question_type ?? null) ||
    "coding";
  const isCodingTask = effectiveQuestionType === "coding";

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        console.log("Raw screenshot data:", existing)
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        console.log("Processed screenshots:", screenshots)
        setExtraScreenshots(screenshots)
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        setExtraScreenshots([])
      }
    }

    fetchScreenshots()
  }, [solutionData])

  const { showToast } = useToast()

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        applySolutionState(null)
      }),
      window.electronAPI.onProblemExtracted((data) => {
        queryClient.setQueryData(["problem_statement"], data)
        setQuestionType(normalizeQuestionType(data?.question_type ?? null))
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", error, "error")
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as SolutionPayload | null
        if (!solution) {
          setView("queue")
        }
        applySolutionState(solution)
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return
        }
        console.log({ data })
        const normalizedSolution: SolutionPayload = {
          answer_type: data.answer_type || (data.code ? "code" : "analysis"),
          content: data.content || data.code || "",
          code: data.code || data.content || "",
          thoughts: data.thoughts || [],
          time_complexity: data.time_complexity ?? null,
          space_complexity: data.space_complexity ?? null,
          key_takeaways: Array.isArray(data.key_takeaways) ? data.key_takeaways : undefined,
          question_type: data.question_type
        }

        queryClient.setQueryData(["solution"], normalizedSolution)
        applySolutionState(normalizedSolution)

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const screenshots =
              existing.previews?.map((p) => ({
                id: p.path,
                path: p.path,
                preview: p.preview,
                timestamp: Date.now()
              })) || []
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true)
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data) => {
        queryClient.setQueryData(["new_solution"], data)
        setDebugProcessing(false)
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
          "neutral"
        )
      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  useEffect(() => {
    const cachedProblem = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null
    setProblemStatementData(cachedProblem || null)
    setQuestionType(normalizeQuestionType(cachedProblem?.question_type ?? null))

    applySolutionState(
      (queryClient.getQueryData(["solution"]) as SolutionPayload | null) ?? null
    )

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        const updatedProblem = queryClient.getQueryData(["problem_statement"]) as ProblemStatementData | null
        setProblemStatementData(updatedProblem || null)
        setQuestionType(normalizeQuestionType(updatedProblem?.question_type ?? null))
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as SolutionPayload | null
        applySolutionState(solution)
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot", "error")
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
      showToast("Error", "Failed to delete the screenshot", "error")
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        <div ref={contentRef} className="relative">
          <div className="space-y-3 px-4 py-3">
          {/* Screenshot queue + command bar */}
          <div className="bg-transparent w-fit">
            <div className="space-y-3 w-fit">
              {solutionData && (
                <ScreenshotQueue
                  isLoading={debugProcessing}
                  screenshots={extraScreenshots}
                  onDeleteScreenshot={handleDeleteExtraScreenshot}
                />
              )}

              <SolutionCommands
                onTooltipVisibilityChange={handleTooltipVisibilityChange}
                isProcessing={!problemStatementData || !solutionData}
                extraScreenshots={extraScreenshots}
                credits={credits}
                currentLanguage={currentLanguage}
                setLanguage={setLanguage}
                isCodingTask={isCodingTask}
              />
            </div>
          </div>

          {/* Main Content - Modified width constraints */}
          <div className="w-full text-sm text-black bg-black/60 rounded-md">
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                {!solutionData && (
                  <>
                    <ContentSection
                      title="Problem Statement"
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />
                    {hasDisplayValue(problemStatementData?.constraints) && isCodingTask && (
                      <ContentSection
                        title="Constraints"
                        content={problemStatementData?.constraints}
                        isLoading={false}
                      />
                    )}
                    {hasDisplayValue(problemStatementData?.answer_expectations) && (
                      <ContentSection
                        title="Answer Expectations"
                        content={problemStatementData?.answer_expectations}
                        isLoading={false}
                      />
                    )}
                    {hasDisplayValue(problemStatementData?.supporting_material) && (
                      <ContentSection
                        title="Supporting Material"
                        content={
                          <div className="whitespace-pre-wrap">
                            {problemStatementData?.supporting_material}
                          </div>
                        }
                        isLoading={false}
                      />
                    )}
                    {hasDisplayValue(problemStatementData?.evaluation_focus) && (
                      <ContentSection
                        title="Evaluation Focus"
                        content={problemStatementData?.evaluation_focus}
                        isLoading={false}
                      />
                    )}
                    {problemStatementData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                          Generating {isCodingTask ? "solutions" : "responses"}...
                        </p>
                      </div>
                    )}
                  </>
                )}

                {solutionData && (
                  <>
                    <ContentSection
                      title={`${answerType === "code" ? "My Thoughts" : "Reasoning Steps"} (${COMMAND_KEY} + Arrow keys to scroll)`}
                      content={
                        thoughtsData && thoughtsData.length > 0 ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              {thoughtsData.map((thought, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-2"
                                >
                                  <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                                  <div>{thought}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-white/60">
                            {answerType === "code"
                              ? "Collecting reasoning details..."
                              : "Reasoning steps will appear here once available."}
                          </p>
                        )
                      }
                      isLoading={!thoughtsData}
                    />

                    <SolutionSection
                      title={answerType === "code" ? "Solution" : "Response"}
                      content={solutionData}
                      isLoading={!solutionData}
                      currentLanguage={currentLanguage}
                      answerType={answerType}
                    />                    {answerType !== "code" && keyTakeawaysData && keyTakeawaysData.length > 0 && (
                      <ContentSection
                        title="Key Takeaways"
                        content={
                          <div className="space-y-1">
                            {keyTakeawaysData.map((takeaway, index) => (
                              <div key={index} className="flex items-start gap-2">
                                <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                                <div>{takeaway}</div>
                              </div>
                            ))}
                          </div>
                        }
                        isLoading={!keyTakeawaysData}
                      />
                    )}

                    {answerType === "code" && (
                      <ComplexitySection
                        timeComplexity={timeComplexityData}
                        spaceComplexity={spaceComplexityData}
                        isLoading={!timeComplexityData || !spaceComplexityData}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  )
}

export default Solutions
