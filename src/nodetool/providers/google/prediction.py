import google.generativeai as genai

from nodetool.types.prediction import Prediction, PredictionResult


async def run_gemini(
    prediction: Prediction,
    env: dict[str, str],
):
    assert prediction.model is not None, "Model is not set"
    assert prediction.params is not None, "Params are not set"
    assert env.get("GEMINI_API_KEY") is not None, "GEMINI_API_KEY is not set"
    assert prediction.params.get("contents") is not None, "Contents are not set"
    assert prediction.params.get("config") is not None, "Config is not set"

    history = prediction.params.get("history", [])
    system_instruction = prediction.params.get("system_instruction", "")

    config = genai.GenerationConfig(
        temperature=prediction.params["config"]["temperature"],
        top_p=prediction.params["config"]["top_p"],
        top_k=prediction.params["config"]["top_k"],
        max_output_tokens=prediction.params["config"]["max_output_tokens"],
    )

    genai.configure(api_key=env.get("GEMINI_API_KEY"))
    model = genai.GenerativeModel(
        prediction.model,
        generation_config=config,
        system_instruction=system_instruction,
    )

    if history:
        chat = model.start_chat(history=history)
        response = chat.send_message(prediction.params["contents"])
    else:
        response = model.generate_content(prediction.params["contents"])

    yield PredictionResult(
        prediction=prediction,
        content=response.to_dict(),
        encoding="json",
    )
