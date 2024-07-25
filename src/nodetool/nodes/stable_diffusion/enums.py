import enum


class Scheduler(str, enum.Enum):
    normal = "normal"
    karras = "karras"
    exponential = "exponential"
    sgm_uniform = "sgm_uniform"
    simple = "simple"
    ddim_uniform = "ddim_uniform"


class Sampler(str, enum.Enum):
    euler = "euler"
    euler_ancestral = "euler_ancestral"
    heun = "heun"
    heunpp2 = "heunpp2"
    dpm_2 = "dpm_2"
    dpm_2_ancestral = "dpm_2_ancestral"
    lms = "lms"
    dpm_fast = "dpm_fast"
    dpm_adaptive = "dpm_adaptive"
    dpmpp_2s_ancestral = "dpmpp_2s_ancestral"
    dpmpp_sde = "dpmpp_sde"
    dpmpp_sde_gpu = "dpmpp_sde_gpu"
    dpmpp_2m = "dpmpp_2m"
    dpmpp_2m_sde = "dpmpp_2m_sde"
    dpmpp_2m_sde_gpu = "dpmpp_2m_sde_gpu"
    dpmpp_3m_sde = "dpmpp_3m_sde"
    dpmpp_3m_sde_gpu = "dpmpp_3m_sde_gpu"
    ddpm = "ddpm"
    lcm = "lcm"