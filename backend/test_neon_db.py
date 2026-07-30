from app.database import SessionLocal, engine
from app.models import User
from app.auth import hash_password
import uuid

def test_db_connection():
    print("Testing connection to Neon PostgreSQL database...")
    db = SessionLocal()
    try:
        # Create a test user matching model fields (name, email, password_hash, is_verified)
        test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        test_name = f"TestUser_{uuid.uuid4().hex[:4]}"
        hashed_pw = hash_password("TestPassword123!")
        
        new_user = User(
            name=test_name,
            email=test_email,
            password_hash=hashed_pw,
            is_verified=True
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        print("SUCCESS: Saved test user to Neon DB!")
        print(f"   User ID: {new_user.id}")
        print(f"   Email: {new_user.email}")
        print(f"   Name: {new_user.name}")
        print(f"   Is Verified: {new_user.is_verified}")
        print(f"   Created At: {new_user.created_at}")
        
        # Verify query
        retrieved_user = db.query(User).filter(User.id == new_user.id).first()
        assert retrieved_user is not None, "Failed to retrieve user from DB"
        print(f"VERIFIED: Queried user from Neon DB successfully (ID: {retrieved_user.id})")
        
    except Exception as e:
        print(f"ERROR: Database test failed: {e}")
        db.rollback()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    test_db_connection()
