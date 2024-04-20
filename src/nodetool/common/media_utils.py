import subprocess

def get_media_duration(file_path: str) -> float:
    """Extract the media duration using ffprobe."""
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if result.returncode != 0:
        print(f"+++++++ ffprobe error output: {result.stderr}") 
        raise Exception(f"Error getting media duration: {result.stderr}")

    try:
        duration = float(result.stdout.strip())
        print(f"+++++++ Media duration is {duration} seconds.")
        return duration
    except ValueError:
        raise Exception("Failed to parse media duration.")


def repackage_and_get_duration(source_path):
    # Repackage the file to get the duration if the initial attempt failed
    repackaged_path = f"{source_path.rsplit('.', 1)[0]}_repackaged.webm"
    cmd_repackage = [
        'ffmpeg', '-i', source_path, '-vcodec', 'copy', '-acodec', 'copy', repackaged_path
    ]
    subprocess.run(cmd_repackage, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    cmd_ffprobe = [
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', repackaged_path
    ]
    result = subprocess.run(cmd_ffprobe, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode == 0:
        try:
            return float(result.stdout.strip())
        except ValueError:
            print("Failed to parse duration after repackaging.")
    else:
        print("Failed to get duration even after repackaging.")
        print(result.stderr)
    return None

# def get_media_duration(file_path: str) -> float:
#     """Extract the media duration using ffprobe."""
#     cmd = [
#         'ffprobe', 
#         '-v', 'error', 
#         '-show_entries', 'format=duration', 
#         '-of', 'default=noprint_wrappers=1:nokey=1', 
#         file_path
#     ]
#     result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
#     if result.returncode != 0:
#         raise Exception(f"Error getting media duration: {result.stderr}")
#     return float(result.stdout.strip())
