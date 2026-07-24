import json
import os
import re
from functools import lru_cache
from typing import Any

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from transformers import AutoProcessor
import uvicorn


ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://lifeline-your-problem-solver.vercel.app",
]

MODEL_PATH = os.getenv(
    "GEMMA_MODEL_PATH",
    "/kaggle/input/models/google/gemma-4/other/gemma-4-e4b-it-qat-mobile-ct/2",
)

MODEL_AVAILABLE = False
MODEL_LOAD_ERROR: str | None = None


def import_gemma_model_class() -> type[Any] | None:
    try:
        from transformers import Gemma4ForConditionalGeneration
        return Gemma4ForConditionalGeneration
    except (ImportError, ModuleNotFoundError):
        try:
            from transformers.models.gemma4 import Gemma4ForConditionalGeneration
            return Gemma4ForConditionalGeneration
        except (ImportError, ModuleNotFoundError):
            return None

app = FastAPI(title="LIFELINE Gemma API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User problem or context")
    system_prompt: str | None = Field(default="", description="Optional system instruction")
    temperature: float | None = Field(default=0.7, ge=0.0, le=2.0)
    max_new_tokens: int | None = Field(default=512, ge=32, le=2048)


class GenerateResponse(BaseModel):
    response: str


class ErrorResponse(BaseModel):
    detail: str


@lru_cache(maxsize=1)
def load_model_and_processor() -> tuple[Any, Any]:
    global MODEL_AVAILABLE, MODEL_LOAD_ERROR

    model_class = import_gemma_model_class()
    if model_class is None:
        MODEL_AVAILABLE = False
        MODEL_LOAD_ERROR = "Gemma 4 model class is unavailable in this Transformers installation."
        raise ImportError(MODEL_LOAD_ERROR)

    processor = AutoProcessor.from_pretrained(MODEL_PATH, local_files_only=True)
    model = model_class.from_pretrained(
        MODEL_PATH,
        torch_dtype="auto",
        device_map="auto",
        local_files_only=True,
    )
    model.eval()
    MODEL_AVAILABLE = True
    MODEL_LOAD_ERROR = None
    return model, processor


def build_structured_schema() -> dict[str, Any]:
    return {
        "category": "education | healthcare | agriculture | productivity | community | general",
        "problemSummary": "A concise explanation of the user's actual problem",
        "userIntent": "What the user is trying to achieve",
        "urgency": "low | medium | high",
        "actionPlan": [
            {
                "id": "unique-id",
                "title": "Action step",
                "description": "What the user should do",
                "timeframe": "Optional timeframe",
                "status": "pending",
            }
        ],
        "suggestedTools": [
            {
                "id": "unique-id",
                "type": "notes | quiz | scenarios | explanation | study_plan | checklist | project_plan | resource_finder",
                "title": "Tool title",
                "description": "What this tool does",
            }
        ],
        "followUpQuestions": [],
        "resources": [],
    }


def build_fallback_payload(prompt: str) -> dict[str, Any]:
    return {
        "category": "general",
        "problemSummary": prompt.strip()[:240] or "The user described a situation that needs practical guidance.",
        "userIntent": "Understand the problem and identify the next helpful action.",
        "urgency": "medium",
        "actionPlan": [
            {
                "id": "fallback-step-1",
                "title": "Clarify the issue",
                "description": "Write down the specific problem and what you have already tried.",
                "timeframe": "Today",
                "status": "pending",
            }
        ],
        "suggestedTools": [],
        "followUpQuestions": ["What is the most important part of this problem to solve first?"],
        "resources": [],
    }


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        payload = json.loads(cleaned)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            payload = json.loads(match.group(0))
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass

    raise ValueError("model output was not valid JSON")


def generate_text(prompt: str, system_prompt: str, temperature: float, max_new_tokens: int) -> str:
    if not MODEL_AVAILABLE:
        load_model_and_processor()
    model, processor = load_model_and_processor()

    final_prompt = (
        (system_prompt or "You are LIFELINE, a calm practical assistant.")
        + "\nReturn ONLY a single JSON object that matches the requested schema.\n\n"
        + f"Use this schema:\n{json.dumps(build_structured_schema(), indent=2)}\n\n"
        + f"Problem: {prompt}"
    )

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": final_prompt,
                }
            ],
        }
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_tensors="pt",
    )

    if isinstance(inputs, dict):
        inputs = {
            key: value.to(model.device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
    else:
        inputs = inputs.to(model.device)

    with torch.inference_mode():
        outputs = model.generate(
            **inputs if isinstance(inputs, dict) else {"input_ids": inputs},
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
            top_p=0.95,
            repetition_penalty=1.1,
        )

    input_length = inputs.shape[-1] if hasattr(inputs, "shape") else inputs["input_ids"].shape[-1]
    generated_text = processor.decode(outputs[0][input_length:], skip_special_tokens=True)
    return generated_text.strip()


@app.get("/health")
def health() -> dict[str, str | bool | None]:
    return {
        "status": "ok",
        "service": "LIFELINE Gemma API",
        "model": "Gemma 4",
        "model_available": MODEL_AVAILABLE,
        "model_path": MODEL_PATH,
        "model_error": MODEL_LOAD_ERROR,
    }


@app.post("/generate", response_model=GenerateResponse, responses={500: {"model": ErrorResponse}})
def generate(payload: GenerateRequest, request: Request) -> GenerateResponse:
    if not payload.prompt or not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    try:
        raw_text = generate_text(
            prompt=payload.prompt,
            system_prompt=payload.system_prompt or "",
            temperature=float(payload.temperature or 0.7),
            max_new_tokens=int(payload.max_new_tokens or 512),
        )
        parsed = extract_json_object(raw_text)
        return GenerateResponse(response=json.dumps(parsed))
    except Exception as exc:  # noqa: BLE001
        fallback_payload = build_fallback_payload(payload.prompt)
        return GenerateResponse(response=json.dumps(fallback_payload))


if __name__ == "__main__":
    try:
        import asyncio

        if asyncio.get_event_loop().is_running():
            print("Event loop is already running; uvicorn startup skipped.")
        else:
            uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")), reload=False)
    except RuntimeError:
        print("Unable to start uvicorn because an event loop is already running.")
