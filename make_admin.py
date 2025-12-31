from app import app, db, User

# --- CONFIGURATION ---
# *** CHANGE THIS to the username of the user you just registered ***
USERNAME_TO_MAKE_ADMIN = "admin"
# ---------------------

with app.app_context():
    user = db.session.execute(
        db.select(User).filter_by(username=USERNAME_TO_MAKE_ADMIN)
    ).scalar_one_or_none()

    if user:
        user.role = 'admin'
        db.session.commit()
        print(f"Success: User '{USERNAME_TO_MAKE_ADMIN}' has been promoted to admin.")
    else:
        print(f"Error: User '{USERNAME_TO_MAKE_ADMIN}' not found in the database.")