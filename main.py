import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from database import init_db, User, Topic, StudySession
from auth import get_db, get_current_user, get_password_hash, verify_password, create_access_token
import schemas

app = FastAPI(title="SimplePomodoro API", description="Backend API for SimplePomodoro SPA")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def on_startup():
    init_db()

# REST Endpoints

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if username exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    hashed_pwd = get_password_hash(user_data.password)
    new_user = User(username=user_data.username, password_hash=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create a default topic for the user so they have something immediately
    default_topics = [
        ("Work", "#800080"),
        ("Study", "#3B82F6"),
        ("Exercise", "#10B981")
    ]
    for name, color in default_topics:
        topic = Topic(user_id=new_user.id, topic_name=name, color_hex=color)
        db.add(topic)
    db.commit()

    return new_user

@app.post("/api/auth/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username
    }

# Also support JSON login for easy API consumption
@app.post("/api/auth/login", response_model=schemas.Token)
def login_json(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username
    }

@app.get("/api/topics", response_model=List[schemas.TopicResponse])
def get_topics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Topic).filter(Topic.user_id == current_user.id).all()

@app.post("/api/topics", response_model=schemas.TopicResponse)
def create_topic(
    topic_data: schemas.TopicCreate, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    new_topic = Topic(
        user_id=current_user.id,
        topic_name=topic_data.topic_name,
        color_hex=topic_data.color_hex
    )
    db.add(new_topic)
    db.commit()
    db.refresh(new_topic)
    return new_topic

@app.get("/api/sessions", response_model=List[schemas.StudySessionResponse])
def get_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Perform join to fetch topic details
    results = db.query(
        StudySession.id,
        StudySession.user_id,
        StudySession.topic_id,
        StudySession.duration_minutes,
        StudySession.timestamp,
        Topic.topic_name,
        Topic.color_hex
    ).join(Topic, StudySession.topic_id == Topic.id)\
     .filter(StudySession.user_id == current_user.id)\
     .order_by(StudySession.timestamp.desc())\
     .all()

    return [
        schemas.StudySessionResponse(
            id=r.id,
            user_id=r.user_id,
            topic_id=r.topic_id,
            duration_minutes=r.duration_minutes,
            timestamp=r.timestamp,
            topic_name=r.topic_name,
            color_hex=r.color_hex
        ) for r in results
    ]

@app.post("/api/sessions", response_model=schemas.StudySessionResponse)
def create_session(
    session_data: schemas.StudySessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify the topic belongs to the user
    topic = db.query(Topic).filter(Topic.id == session_data.topic_id, Topic.user_id == current_user.id).first()
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found or access denied"
        )
    
    new_session = StudySession(
        user_id=current_user.id,
        topic_id=session_data.topic_id,
        duration_minutes=session_data.duration_minutes,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Return with topic details
    return schemas.StudySessionResponse(
        id=new_session.id,
        user_id=new_session.user_id,
        topic_id=new_session.topic_id,
        duration_minutes=new_session.duration_minutes,
        timestamp=new_session.timestamp,
        topic_name=topic.topic_name,
        color_hex=topic.color_hex
    )

@app.get("/api/analytics")
def get_analytics(
    filter: str = "day", 
    date: Optional[str] = None,
    timezone_offset_minutes: int = 0,
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    # Local time calculation: session timestamp + (timezone_offset_minutes) -> localized
    # timezone_offset_minutes is passed from the client, e.g. -180 for UTC+3 (since getTimezoneOffset returns negative of GMT offset in minutes in JS or positive for west, wait: in JS, for UTC+3, getTimezoneOffset() is -180).
    # To convert UTC to local: local_time = utc_time - timezone_offset_minutes (in minutes)
    
    sessions = db.query(StudySession, Topic)\
                 .join(Topic, StudySession.topic_id == Topic.id)\
                 .filter(StudySession.user_id == current_user.id)\
                 .all()
    
    if date:
        try:
            # Parse YYYY-MM-DD local reference date
            parts = date.split('-')
            now_local = datetime.datetime(int(parts[0]), int(parts[1]), int(parts[2]), 12, 0, 0)
        except Exception:
            now_utc = datetime.datetime.utcnow()
            now_local = now_utc - datetime.timedelta(minutes=timezone_offset_minutes)
    else:
        now_utc = datetime.datetime.utcnow()
        now_local = now_utc - datetime.timedelta(minutes=timezone_offset_minutes)
    
    # Filter sessions based on local time
    filtered_sessions = []
    for s, t in sessions:
        s_local = s.timestamp - datetime.timedelta(minutes=timezone_offset_minutes)
        filtered_sessions.append((s, t, s_local))

    # Helper: check same day
    def is_same_day(d1, d2):
        return d1.year == d2.year and d1.month == d2.month and d1.day == d2.day

    # Apply date filters
    if filter == "day":
        # Selected day only
        active_sessions = [(s, t, sl) for s, t, sl in filtered_sessions if is_same_day(sl, now_local)]
        
        # Hourly breakdown: 24 bars (00:00 to 23:00)
        labels = [f"{hour:02d}:00" for hour in range(24)]
        values = [0.0] * 24
        for s, t, sl in active_sessions:
            hour = sl.hour
            values[hour] += s.duration_minutes / 60.0 # Convert to hours for vertical bar chart
            
    elif filter == "week":
        # Selected day and past 6 days
        start_date = (now_local - datetime.timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)
        active_sessions = [(s, t, sl) for s, t, sl in filtered_sessions if start_date <= sl <= end_date]
        
        # 7 days labels (e.g. Mon, Tue, etc. or Month-Day)
        labels = []
        date_map = {}
        for i in range(7):
            d = start_date + datetime.timedelta(days=i)
            lbl = d.strftime("%a %m/%d")
            labels.append(lbl)
            date_map[d.date()] = i
            
        values = [0.0] * 7
        for s, t, sl in active_sessions:
            s_date = sl.date()
            if s_date in date_map:
                values[date_map[s_date]] += s.duration_minutes / 60.0

    elif filter == "month":
        # Selected day and past 29 days
        start_date = (now_local - datetime.timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)
        active_sessions = [(s, t, sl) for s, t, sl in filtered_sessions if start_date <= sl <= end_date]
        
        labels = []
        date_map = {}
        for i in range(30):
            d = start_date + datetime.timedelta(days=i)
            lbl = d.strftime("%m/%d")
            labels.append(lbl)
            date_map[d.date()] = i
            
        values = [0.0] * 30
        for s, t, sl in active_sessions:
            s_date = sl.date()
            if s_date in date_map:
                values[date_map[s_date]] += s.duration_minutes / 60.0

    elif filter == "year":
        # Current year of the selected day
        current_year = now_local.year
        active_sessions = [(s, t, sl) for s, t, sl in filtered_sessions if sl.year == current_year]
        
        # Group by months of current year
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        values = [0.0] * 12
        for s, t, sl in active_sessions:
            month_idx = sl.month - 1
            values[month_idx] += s.duration_minutes / 60.0

    else: # "summary" or fallback
        # Summary grouping by Year (past 5 years relative to selected day)
        current_year = now_local.year
        start_year = current_year - 4
        active_sessions = [(s, t, sl) for s, t, sl in filtered_sessions if start_year <= sl.year <= current_year]
        
        labels = [str(yr) for yr in range(start_year, current_year + 1)]
        year_map = {int(yr): i for i, yr in enumerate(labels)}
        values = [0.0] * len(labels)
        for s, t, sl in active_sessions:
            yr = sl.year
            if yr in year_map:
                values[year_map[yr]] += s.duration_minutes / 60.0

    # Calculate Topic Breakdown (for Pie Chart)
    topic_times = {}
    topic_colors = {}
    for s, t, sl in active_sessions:
        name = t.topic_name
        color = t.color_hex
        topic_times[name] = topic_times.get(name, 0.0) + s.duration_minutes
        topic_colors[name] = color

    pie_labels = list(topic_times.keys())
    pie_values = [time_min / 60.0 for time_min in topic_times.values()] # Let's show in hours
    pie_colors = [topic_colors[name] for name in pie_labels]

    # Overall stats
    total_sessions_count = len(active_sessions)
    total_duration_min = sum(s.duration_minutes for s, t, sl in active_sessions)

    # Format localized sessions list for frontend table display
    sessions_list = []
    # Sort by localized timestamp descending (newest first)
    sorted_active_sessions = sorted(active_sessions, key=lambda x: x[0].timestamp, reverse=True)
    for s, t, sl in sorted_active_sessions:
        sessions_list.append({
            "id": s.id,
            "topic_id": s.topic_id,
            "duration_minutes": s.duration_minutes,
            "timestamp": s.timestamp.isoformat() + "Z",
            "topic_name": t.topic_name,
            "color_hex": t.color_hex
        })

    return {
        "bar_chart": {
            "labels": labels,
            "values": [round(v, 2) for v in values]
        },
        "pie_chart": {
            "labels": pie_labels,
            "values": [round(v, 2) for v in pie_values],
            "colors": pie_colors
        },
        "stats": {
            "total_sessions": total_sessions_count,
            "total_duration_minutes": round(total_duration_min, 1)
        },
        "sessions": sessions_list
    }


# Frontend SPA static serving
FRONTEND_DIR = "C:/Users/Lenovo/.gemini/antigravity/scratch/pomodoro_app/frontend"

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/app.js")
def serve_app_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "app.js"))

@app.get("/favicon.ico")
def serve_favicon():
    # Return empty response or simple icon
    return ""

# Mount the entire frontend folder in case there are static styling, scripts, or assets
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
