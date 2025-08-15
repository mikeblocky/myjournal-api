# MyJournal Backend

## Setup Instructions

### 1. Environment Variables

The backend requires several environment variables to function properly. Copy `env.example` to `.env` and fill in your values:

```bash
cp env.example .env
```

#### Required Variables:

- **`JWT_SECRET`** - A long, random string for JWT token signing
- **`MONGODB_URI`** - MongoDB connection string

#### Optional Variables:

- **`CORS_ORIGIN`** - Frontend domain for CORS (defaults to allowing all)
- **`AI_API_KEY`** - OpenAI API key for AI features
- **`NEWSAPI_KEY`** - NewsAPI key for news features
- **`GNEWS_API_KEY`** - GNews API key for news features

### 2. Generate JWT Secret

Generate a secure JWT secret:

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 64

# Option 3: Online generator
# Visit: https://generate-secret.vercel.app/64
```

### 3. MongoDB Setup

#### Local MongoDB:
```bash
# Install MongoDB locally
# Then set in .env:
MONGODB_URI=mongodb://localhost:27017/myjournal
```

#### MongoDB Atlas (Cloud):
1. Create account at [MongoDB Atlas](https://mongodb.com/atlas)
2. Create a cluster
3. Get connection string
4. Set in .env:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/myjournal
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

## Troubleshooting

### Common Issues:

1. **"JWT_SECRET environment variable is not configured"**
   - Make sure you have a `.env` file with `JWT_SECRET` set

2. **"MONGODB_URI environment variable is missing"**
   - Set `MONGODB_URI` in your `.env` file
   - Ensure MongoDB is running and accessible

3. **CORS errors**
   - Check that `CORS_ORIGIN` is set correctly
   - Or leave it unset to allow all origins (for development)

4. **400 errors during signup/login**
   - Check server logs for detailed error messages
   - Ensure all required environment variables are set
   - Verify MongoDB connection

### Debug Mode:

Set `NODE_ENV=development` in your `.env` file for additional logging.

## API Endpoints

- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User authentication
- `GET /api/auth/me` - Get current user (requires auth)
- `GET /api/health` - Health check
- `GET /api/test-cors` - CORS test endpoint

## Security Notes

- Never commit your `.env` file to version control
- Use strong, unique JWT secrets in production
- Restrict CORS origins in production
- Use HTTPS in production
