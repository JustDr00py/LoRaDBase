use loradb::security::jwt::{Claims, JwtService};
use std::env;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: {} <username> [jwt_secret] [expiration_hours]", args[0]);
        eprintln!("\nIf jwt_secret is not provided, it will be read from LORADB_API_JWT_SECRET env var");
        eprintln!("If expiration_hours is not provided, it will be read from LORADB_API_JWT_EXPIRATION_HOURS env var (default: 1)");
        std::process::exit(1);
    }

    let username = &args[1];

    // Get JWT secret from arg or env
    let jwt_secret = if args.len() >= 3 {
        args[2].clone()
    } else {
        env::var("LORADB_API_JWT_SECRET")
            .expect("LORADB_API_JWT_SECRET environment variable not set")
    };

    // Get expiration hours from arg or env
    let expiration_hours: i64 = if args.len() >= 4 {
        args[3].parse()
            .expect("expiration_hours must be a valid integer")
    } else {
        env::var("LORADB_API_JWT_EXPIRATION_HOURS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1)
    };

    // Create JWT service
    let jwt_service = JwtService::new(&jwt_secret)?;

    // Create claims with configured expiration
    let claims = Claims::with_expiration_hours(username.to_string(), expiration_hours);

    // Generate token
    let token = jwt_service.generate_token(claims)?;

    println!("Generated JWT token for user '{}':", username);
    println!("Expiration: {} hour{}", expiration_hours, if expiration_hours == 1 { "" } else { "s" });
    println!("\n{}\n", token);
    println!("Use this token in API requests:");
    println!("curl -H 'Authorization: Bearer {}' https://your-domain.com/devices", token);

    Ok(())
}
