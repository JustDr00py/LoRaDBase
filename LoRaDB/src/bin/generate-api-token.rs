use loradb::security::api_token::ApiTokenStore;
use std::env;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() < 3 {
        eprintln!("Usage: {} <data_dir> <username> [token_name] [expiration_days]", args[0]);
        eprintln!("\nArguments:");
        eprintln!("  data_dir         - Path to data directory (where api_tokens.json is stored)");
        eprintln!("  username         - User ID who owns the token");
        eprintln!("  token_name       - Human-readable name for the token (default: 'API Token')");
        eprintln!("  expiration_days  - Number of days until token expires (default: never expires)");
        eprintln!("\nExamples:");
        eprintln!("  {} /var/lib/loradb/data admin", args[0]);
        eprintln!("  {} /var/lib/loradb/data admin 'Production Dashboard'", args[0]);
        eprintln!("  {} /var/lib/loradb/data admin 'Dev Token' 365", args[0]);
        std::process::exit(1);
    }

    let data_dir = PathBuf::from(&args[1]);
    let username = &args[2];
    let token_name = if args.len() >= 4 {
        args[3].clone()
    } else {
        "API Token".to_string()
    };
    let expiration_days: Option<i64> = if args.len() >= 5 {
        Some(args[4].parse()
            .expect("expiration_days must be a valid integer"))
    } else {
        None
    };

    // Create token store
    let token_store_path = data_dir.join("api_tokens.json");
    let token_store = ApiTokenStore::new(&token_store_path)?;

    // Create token
    let (token_string, api_token) = token_store.create_token(
        token_name.clone(),
        username.to_string(),
        expiration_days,
    )?;

    println!("✓ API token created successfully!");
    println!();
    println!("Token Details:");
    println!("  ID:         {}", api_token.id);
    println!("  Name:       {}", api_token.name);
    println!("  User:       {}", api_token.created_by);
    println!("  Created:    {}", api_token.created_at.format("%Y-%m-%d %H:%M:%S UTC"));

    if let Some(expires_at) = api_token.expires_at {
        println!("  Expires:    {}", expires_at.format("%Y-%m-%d %H:%M:%S UTC"));
    } else {
        println!("  Expires:    Never");
    }

    println!();
    println!("Your API Token (save this securely - it won't be shown again):");
    println!("{}", token_string);
    println!();
    println!("Use this token in API requests:");
    println!("  curl -H 'Authorization: Bearer {}' https://your-domain.com/devices", token_string);
    println!();
    println!("Token saved to: {}", token_store_path.display());

    Ok(())
}
